
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

let BufferSize = 60;
let Layout, CanvasUp, CanvasDown, FBInfo;


function _drawCanvas() {
  let canvas = this;

  let maxBytes = Math.floor(canvas.chartData.max / 8);

  let [width, height] = canvas.get_surface_size();

  // Paranoia
  if (width != BufferSize || height <= 0) return;

  let ctx = canvas.get_context();

  // Clear
  let backgroundColor = new Clutter.Color({ red:48, green:48, blue:48, alpha:255 });
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

let TickCount, StopTimer, Busy;
function _timer() {
  if (StopTimer) return;
  Mainloop.timeout_add_seconds(1, _timer);
  TickCount++; if (TickCount == 100) TickCount = 0;
  
  if (Busy) return;

  if (!CanvasUp.chartData.max || !CanvasDown.chartData.max) {
    Busy = true;

    FBInfo.GetRemote('192.168.254.1', 'LinkStatus', function(result) {

      if (result && result[0]) {
        CanvasUp.chartData.max    = result[0].MaxBitsIn;
        CanvasDown.chartData.max  = result[0].MaxBitsOut; 
      }

      Busy = false;
    });

  }
  else {

    Busy = true;
    FBInfo.GetRemote('192.168.254.1', 'TrafficStatus', function(result) {

      if (result && result[0]) {
        CanvasUp.chartData.buffer.push({
            inet: result[0].InetBytesOutRate,
            other: result[0].OtherBytesOutRate
        });
        if (CanvasUp.chartData.buffer.length > BufferSize) CanvasUp.chartData.buffer.shift();
        CanvasDown.chartData.buffer.push({
            inet: result[0].InetBytesInRate,
            other: result[0].OtherBytesInRate
        });
        if (CanvasDown.chartData.buffer.length > BufferSize) CanvasDown.chartData.buffer.shift();
      }

      CanvasUp.queue_repaint();
      CanvasDown.queue_repaint();
      
      Busy = false;
    });

  }

}


function init() {

  let FontSize = Math.round(Panel.PANEL_ICON_SIZE / 2);

  Layout = new St.BoxLayout({ style_class: 'um-widget' });

  let labelUp = new St.Label({ text: "▲", style: "font-size:"+FontSize+"px;" });
  CanvasUp = new St.DrawingArea({style_class: 'um-chart-up', reactive: false});
  CanvasUp.set_width(BufferSize);

  Layout.add(labelUp, { y_align: St.Align.MIDDLE, y_fill: false });
  Layout.add(CanvasUp);

  let labelDown = new St.Label({ text: "▼", style: "font-size:"+FontSize+"px;" });
  CanvasDown = new St.DrawingArea({style_class: 'um-chart-down', reactive: false});
  CanvasDown.set_width(BufferSize);

  Layout.add(labelDown, { y_align: St.Align.MIDDLE, y_fill: false });
  Layout.add(CanvasDown);

  let proxy = Gio.DBusProxy.makeProxyWrapper('<node><interface name="org.cpan.fritzbox.upnp.dbus.info"><method name="Get"><arg type="s" direction="in" /><arg type="s" direction="in" /><arg type="a{su}" direction="out" /></method></interface></node>');
  FBInfo = new proxy(Gio.DBus.session, 'org.cpan.fritzbox.upnp.dbus', '/info');

  CanvasUp.chartData = {
    max:0,
    buffer:[]
  };

  CanvasDown.chartData = {
    max:0,
    buffer:[]
  };

  CanvasUp.connect('repaint', Lang.bind(CanvasUp, _drawCanvas));
  CanvasDown.connect('repaint', Lang.bind(CanvasDown, _drawCanvas));
}

function enable() {
  Main.panel._rightBox.insert_child_at_index(Layout, 0);

  // Start updating
  TickCount = 0;
  StopTimer = false;
  _timer();
}

function disable() {
  Main.panel._rightBox.remove_child(Layout);

  // Stop updating
  StopTimer = true;
}
