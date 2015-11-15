
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

let BufferSize = 60;
let FrameButton;
let CanvasUp, CanvasDown, LabelUp, LabelDown;
let FBInfo, LinkUp, Busy, TickCount, StopTimer;
let CurrentUsageLabels;

function _bytes(value) {
  value = value || 0;

  var units   = [ 'TB', 'GB', 'MB', 'kB', 'B' ];
  var cutoffs = [   0,  8192, 8192, 8192, 1024 ];
  var divs    = [   1,  1024, 1024, 1024, 1024 ];

  while (units.length) {
    var unit  = units.pop();
    var cutoff  = cutoffs.pop();
    var div     = divs.pop();

    if (cutoff && (value > cutoff)) {
      value = Math.floor(value / div);
      continue;
    }

    return value + unit;
  }
}

function _drawCanvas() {
  let canvas = this;

  let maxBytes = Math.floor(canvas.chartData.max / 8);

  let [width, height] = canvas.get_surface_size();

  // Paranoia
  if (width != BufferSize || height <= 0) return;

  let ctx = canvas.get_context();

  // Clear
  let backgroundColor = new Clutter.Color({ red:24, green:24, blue:24, alpha:255 });
  Clutter.cairo_set_source_color(ctx, backgroundColor);
  ctx.rectangle(0, 0, width, height);
  ctx.fill();

  let i;

  // Paint compound graph
  let totalColor = new Clutter.Color({ red:80, green:240, blue:80, alpha:255 });
  ctx.moveTo(0, height);
  for (i=0; i<canvas.chartData.buffer.length; i++) {
    let d = canvas.chartData.buffer[i];
    let t = d.inet + d.other;
    let h = Math.floor(t / (maxBytes / height));
    if (h > height) h = height;
    ctx.lineTo(i, height - h);
  }
  ctx.lineTo(i, height);
  ctx.closePath();
  Clutter.cairo_set_source_color(ctx, totalColor);
  ctx.fill();

  // Print "other traffic" graph
  let otherColor = new Clutter.Color({ red:80, green:80, blue:240, alpha:255 });
  ctx.moveTo(0, height);
  for (i=0; i<canvas.chartData.buffer.length; i++) {
    let d = canvas.chartData.buffer[i];
    let t = d.other;
    let h = Math.floor(t / (maxBytes / height));
    if (h > height) h = height;
    ctx.lineTo(i, height - h);
  }
  ctx.lineTo(i, height);
  ctx.closePath();
  Clutter.cairo_set_source_color(ctx, otherColor);
  ctx.fill();
}

function _timer() {
  if (StopTimer) return;
  Mainloop.timeout_add_seconds(1, _timer);
  TickCount++; if (TickCount == 100) TickCount = 0;
  
  // Query Link status if it's down, or update it every 10 seconds only.  
  if (!LinkUp || (TickCount % 10)) {
    FBInfo.GetRemote('192.168.254.1', 'LinkStatus', function(result) {

      if (result && result[0]) {
        CanvasUp.chartData.max    = result[0].MaxBitsIn;
        CanvasDown.chartData.max  = result[0].MaxBitsOut;

        LinkUp = result[0].LinkStatus ? true:false;
        
        if (LinkUp) {
          // Update labels to show full megabits/sec max bandwidth
          LabelUp.set_text(Math.floor(CanvasUp.chartData.max / 1000000).toString() + 'M');
          LabelDown.set_text(Math.floor(CanvasDown.chartData.max / 1000000).toString() + 'M');
        }
      }

    });
  }

  if (!LinkUp) return;
  if (Busy) return;

  Busy = true;
  FBInfo.GetRemote('192.168.254.1', 'TrafficStatus', function(result) {

    if (result && result[0]) {
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

    CanvasUp.queue_repaint();
    CanvasDown.queue_repaint();
    
    Busy = false;

  });

}


function init() {

  // Just guessing. Is there a better way?
  let FontSize = Math.round(Panel.PANEL_ICON_SIZE / 3) + 1;

  // Main layout. Gets added to the panel.
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
  Main.panel._addToPanelBox('fritzbox-uplink-monitor', FrameButton, 0, Main.panel._rightBox);

  // Start updating
  TickCount = 0;
  StopTimer = false;
  Busy = false;
  LinkUp = false;
  _timer();
}

function disable() {
  Main.panel._rightBox.remove_actor(FrameButton.container);

  // Stop updating
  StopTimer = true;
}
