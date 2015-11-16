
const St = imports.gi.St;
const Main = imports.ui.main;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Panel = imports.ui.panel;
const DBus = imports.gi.DBus;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Util = imports.misc.util;
const Gio = imports.gi.Gio;
const Clutter = imports.gi.Clutter;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Shell = imports.gi.Shell;
const Gdk = imports.gi.Gdk;
const Convenience = Me.imports.convenience;

let BufferSize = 60;
let FrameButton;
let CanvasUp, CanvasDown, LabelUp, LabelDown;
let FBIp, FBInfo, LinkUp, Busy, TickCount, StopTimer;
let CurrentUsageLabels;
let Settings;

function _bytes(value) {
  value = value || 0;

  var units   = [ 'TB', 'GB', 'MB', 'kB', 'B' ];
  var cutoffs = [   0,  8192, 8192, 8192, 1024 ];
  var divs    = [   1,  1024, 1024, 1024, 1024 ];

  while (units.length) {
    var unit    = units.pop();
    var cutoff  = cutoffs.pop();
    var div     = divs.pop();

    if (cutoff && (value > cutoff)) {
      value = Math.floor(value / div);
      continue;
    }

    return value + unit;
  }

  return '???';
}

function _drawCanvas() {
  let canvas = this;

  let maxBytes = Math.floor(canvas.chartData.max / 8);
  //let maxBytesNonLinear = Math.floor( Math.pow((canvas.chartData.max / 8), (1/3)) ) ;

  let [width, height] = canvas.get_surface_size();

  // Paranoia
  if (width != BufferSize || height <= 0) return;

  let ctx = canvas.get_context();

  // Clear
  let backgroundColor = Clutter.Color.from_string(Settings.get_string('background-color'));
  if (!backgroundColor || !backgroundColor[0]) backgroundColor = new Clutter.Color({ red:27, green:27, blue:27, alpha:255 });
  Clutter.cairo_set_source_color(ctx, backgroundColor[1]);
  ctx.rectangle(0, 0, width, height);
  ctx.fill();

  let i;

  // Paint "total" graph
  let totalColor = Clutter.Color.from_string(Settings.get_string('total-color'));
  if (!totalColor || !totalColor[0]) totalColor = new Clutter.Color({ red:252, green:175, blue:62, alpha:255 });
  ctx.moveTo(0, height);
  for (i=0; i<canvas.chartData.buffer.length; i++) {
    let d = canvas.chartData.buffer[i];
    //let t = Math.pow((d.inet + d.other),(1/3));
    //let h = Math.floor(t / (maxBytesNonLinear / height));
    let t = d.inet + d.other;
    let h = Math.floor(t / (maxBytes / height));
    if (h > height) h = height;
    ctx.lineTo(i, height - h);
  }
  ctx.lineTo(i, height);
  ctx.closePath();
  Clutter.cairo_set_source_color(ctx, totalColor[1]);
  ctx.fill();

  // Print "other traffic" graph
  let otherColor = Clutter.Color.from_string(Settings.get_string('other-color'));
  if (!otherColor || !otherColor[0]) otherColor = new Clutter.Color({ red:206, green:92, blue:0, alpha:255 });
  ctx.moveTo(0, height);
  for (i=0; i<canvas.chartData.buffer.length; i++) {
    let d = canvas.chartData.buffer[i];
    //let t = Math.pow(d.other,(1/3));
    //let h = Math.floor(t / (maxBytesNonLinear / height));
    let t = d.other;
    let h = Math.floor(t / (maxBytes / height));
    if (h > height) h = height;
    ctx.lineTo(i, height - h);
  }
  ctx.lineTo(i, height);
  ctx.closePath();
  Clutter.cairo_set_source_color(ctx, otherColor[1]);
  ctx.fill();
}


function _timer() {
  if (StopTimer) return;
  Mainloop.timeout_add_seconds(1, _timer);
  TickCount++; if (TickCount == 100) TickCount = 0;
  
  // Adjust buffersize if it changed in prefs
  BufferSize = Settings.get_uint('chart-width');
  CanvasUp.set_width(BufferSize);
  CanvasDown.set_width(BufferSize);

  // Change FB IP if it changed in prefs. When it changes, reset the charts and link state.
  let fbIp = Settings.get_string('fritzbox-ip') || 'fritz.box';
  if (fbIp != FBIp) {
    // When FB IP 
    CanvasDown.chartData.buffer = [];
    CanvasUp.chartData.buffer = [];
    LinkUp = false;

    CanvasUp.queue_repaint();
    CanvasDown.queue_repaint();
  }
  FBIp = fbIp;

  // Query link status if it's down, or update it every 10 seconds only.  
  if (!LinkUp || !(TickCount % 10)) {
    FBInfo.GetRemote(FBIp, 'LinkStatus', function(result) {

      if (result && result[0]) {
        CanvasUp.chartData.max    = result[0].MaxBitsIn;
        CanvasDown.chartData.max  = result[0].MaxBitsOut;

        LinkUp = result[0].LinkStatus ? true:false;
        
        if (LinkUp) {
          // Update charts labels to show full megabits/sec max bandwidth
          LabelUp.set_text(Math.floor(CanvasUp.chartData.max / 1000000).toString() + 'M');
          LabelDown.set_text(Math.floor(CanvasDown.chartData.max / 1000000).toString() + 'M');
        }
      }

    });
  }

  if (!LinkUp) return;
  if (Busy) return;

  // Get current byte rates
  Busy = true;
  FBInfo.GetRemote(FBIp, 'TrafficStatus', function(result) {

    if (result && result[0]) {
      
      // Update charts
      CanvasUp.chartData.buffer.push({
          inet: result[0].InetBytesOutRate,
          other: result[0].OtherBytesOutRate
      });
      while (CanvasUp.chartData.buffer.length > BufferSize) CanvasUp.chartData.buffer.shift();
      CanvasDown.chartData.buffer.push({
          inet: result[0].InetBytesInRate,
          other: result[0].OtherBytesInRate
      });
      while (CanvasDown.chartData.buffer.length > BufferSize) CanvasDown.chartData.buffer.shift();
      CanvasUp.queue_repaint();
      CanvasDown.queue_repaint();

      // Update popup menu labels
      let valueOrder = [
        result[0].InetBytesOutRate + result[0].OtherBytesOutRate,
        result[0].OtherBytesOutRate,
        result[0].InetBytesInRate + result[0].OtherBytesInRate,
        result[0].OtherBytesInRate
      ];
      for (let i=0; i<4; i++) {
        CurrentUsageLabels[i].set_text(_bytes(valueOrder[i]));
      }
    }

    // Ready for the next round
    Busy = false;

  });

}


function init() {

  // Handle to our gschema settings
  Settings = Convenience.getSettings();

  // Just guessing. Is there a better way?
  let FontSize = Math.round(Panel.PANEL_ICON_SIZE / 3) + 1;

  // Main "button" and layout. Gets added to the panel in enable()
  FrameButton = new PanelMenu.Button(0.5);
  let layout = new St.BoxLayout({ style_class: 'um-widget' });
  FrameButton.actor.add_actor(layout);

  // Upstream label and canvas
  LabelUp = new St.Label({ text: "??M", style: "font-size:"+FontSize+"px;" });
  let layoutUpLabel = new St.BoxLayout({ vertical: true });
  layoutUpLabel.add(new St.Label({ text: "↑", style: "font-size:"+FontSize+"px;" }),
                    { x_align: St.Align.MIDDLE, x_fill: false });
  layoutUpLabel.add(LabelUp,
                    { x_align: St.Align.MIDDLE, x_fill: false })
  layout.add(layoutUpLabel, { y_align: St.Align.MIDDLE, y_fill: false });
  CanvasUp = new St.DrawingArea({style_class: 'um-chart-up', reactive: false});
  CanvasUp.set_width(BufferSize);
  layout.add(CanvasUp);

  // Downstream label and canvas
  LabelDown = new St.Label({ text: "??M", style: "font-size:"+FontSize+"px;" });
  let layoutDownLabel = new St.BoxLayout({ vertical: true });
  layoutDownLabel.add(LabelDown,
                    { x_align: St.Align.MIDDLE, x_fill: false })
  layoutDownLabel.add(new St.Label({ text: "↓", style: "font-size:"+FontSize+"px;" }),
                    { x_align: St.Align.MIDDLE, x_fill: false });
  layout.add(layoutDownLabel, { y_align: St.Align.MIDDLE, y_fill: false });
  CanvasDown = new St.DrawingArea({style_class: 'um-chart-down', reactive: false});
  CanvasDown.set_width(BufferSize);
  layout.add(CanvasDown);

  // DBus handle. Looks like it can't pull the introspection automatically. Meh.
  let proxy = Gio.DBusProxy.makeProxyWrapper('<node><interface name="org.cpan.fritzbox.upnp.dbus.info"><method name="Get"><arg type="s" direction="in" /><arg type="s" direction="in" /><arg type="a{su}" direction="out" /></method></interface></node>');
  FBInfo = new proxy(Gio.DBus.session, 'org.cpan.fritzbox.upnp.dbus', '/info');

  // We glue the chart data buffers to the canvas objects, since this is where
  // we need them. Not so nice, but works for now.
  CanvasUp.chartData = {
    max:0,
    buffer:[]
  };
  CanvasDown.chartData = {
    max:0,
    buffer:[]
  };

  // Popup info
  let infoPopupBox = new St.BoxLayout({ vertical : true, style_class : 'um-infopopup' });

  let labels = [ 'Upstream Total', 'Upstream TV/Phone', 'Downstream Total', 'Downstream TV/Phone' ];

  let table = new St.BoxLayout();
  let lCol = new St.BoxLayout({ vertical : true });
  let rCol = new St.BoxLayout({ vertical : true });

  CurrentUsageLabels = [];
  for (let i=0;i<4;i++) {
    lCol.add(new St.Label({ text: labels[i], style_class : 'um-infopopup-label-left' }));
    let label = new St.Label({ text: "???", style_class : 'um-infopopup-label-right' });
    rCol.add(label);
    CurrentUsageLabels.push(label);
  }

  table.add(lCol);
  table.add(rCol);

  infoPopupBox.add(table);

  let infoPopup = new PopupMenu.PopupBaseMenuItem({ reactive: false, style_class: 'um-infopopup-item' });
  infoPopup.actor.add(infoPopupBox);
  
  let prefsButton = new PopupMenu.PopupBaseMenuItem({ style_class: 'um-infopopup-item' });
  prefsButton.actor.add(new St.Label({ text: "Preferences ..." }));

  FrameButton.menu.addMenuItem(infoPopup);
  FrameButton.menu.addMenuItem(prefsButton);

  // Actions --------------------------------

  // Repaint graphs
  CanvasUp.connect('repaint', Lang.bind(CanvasUp, _drawCanvas));
  CanvasDown.connect('repaint', Lang.bind(CanvasDown, _drawCanvas));

  // Lauch preferences from popup menu
  let appSys = Shell.AppSystem.get_default();
  let gsePrefs = appSys.lookup_app('gnome-shell-extension-prefs.desktop');
  prefsButton.connect('activate', function () {
    if (gsePrefs.get_state() == gsePrefs.SHELL_APP_STATE_RUNNING){
      gsePrefs.activate();
    }
    else {
      let info = gsePrefs.get_app_info();
      let timestamp = global.display.get_current_time_roundtrip();
      info.launch_uris([Me.metadata.uuid], global.create_app_launch_context(timestamp, -1));
    }
  });

}

function enable() {

  // Add to panel
  Main.panel._addToPanelBox('fritzbox-uplink-monitor', FrameButton, 0, Main.panel._rightBox);

  // Start updating
  TickCount = 0;
  StopTimer = false;
  Busy = false;
  LinkUp = false;
  _timer();
}

function disable() {

  // Remove from panel
  Main.panel._rightBox.remove_actor(FrameButton.container);

  // Stop updating
  StopTimer = true;
}
