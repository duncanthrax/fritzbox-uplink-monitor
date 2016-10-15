
const St = imports.gi.St;
const Main = imports.ui.main;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Panel = imports.ui.panel;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Clutter = imports.gi.Clutter;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Shell = imports.gi.Shell;
const Convenience = Me.imports.convenience;
const Soup = imports.gi.Soup;

// Global UI handles
let FrameButton, PrefsButton;
let CanvasUp, CanvasDown;

// Global utility handles
let Settings;
let SoupSession;
let SoupAuthManager;
let SoupAuth;
let IntervalTimer;
let Signals = [];

// Global config variables
let BufferSize = 20;

function oeach(obj, cb) {
    if (!obj || !(typeof(obj) == 'object')) return;

    if (obj instanceof Array) {
        for (var i = 0; i < obj.length; i++) {
            if (cb(i, obj[i]) === false) return;
        }
    }
    else {
        for (var i in obj) { 
            if (obj.hasOwnProperty(i)) {
                if (cb(i, obj[i]) === false) return;
            }
        }
    }
}

// Human-readable byte amounts
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

// GJS does not seem to have its own XML parser.
// The E4X stuff has been deprecated and it looks like it's already gone.
// So we use RX, it probably has less memleaks anyway.
function _grabFromXML(what, xmlstr) {
    var m = xmlstr.match('<'+what+'>(.+?)</'+what+'>');
    if (m && m[1]) return m[1];
    return '';
}

// A lot of magic. It can't be helped, the SOAP interface on the FB is ugly,
// and we don't want to have a full SOAP stack here.
let ActionBusy = {};
function _queryFB(action, successCallback) {
    // Don't run two RPC calls of the same type in parallel
    if (ActionBusy[action]) return;
    ActionBusy[action] = true;

    let fbIp = Settings.get_string('fritzbox-ip') || 'fritz.box';

    let url = 'https://' + fbIp + '/tr064/upnp/control/wancommonifconfig1';

    let authUri = new Soup.URI(url);
    let username = Settings.get_string('fritzbox-username') || 'admin';
    let password = Settings.get_string('fritzbox-password') || '';

    authUri.set_user(username);
    authUri.set_password(password);

    let request = new Soup.Message({ method: 'POST', uri: authUri });
    let headers = request.request_headers;
    headers.append('SoapAction','urn:dslforum-org:service:WANCommonInterfaceConfig:1#' + action);

    let content = "<?xml version='1.0' encoding='utf-8'?>" +
        "<s:Envelope s:encodingStyle='http://schemas.xmlsoap.org/soap/encoding/' xmlns:s='http://schemas.xmlsoap.org/soap/envelope/'>" +
          "<s:Body><u:" + action + " xmlns:u='urn:dslforum-org:service:WANCommonInterfaceConfig:1'><NewSyncGroupIndex>0</NewSyncGroupIndex></u:"+ action +"></s:Body>" +
        "</s:Envelope>";

    request.set_request('text/xml', Soup.MemoryUse.COPY, content, content.length);

    SoupAuthManager.use_auth(authUri, SoupAuth);

    SoupSession.queue_message(request, Lang.bind(this, function(session, message) {
        if (message && (message.status_code == 200)) {
            let data = request.response_body.data;
            if (data && data.match(action+'Response')) successCallback(data);
        }
        ActionBusy[action] = false;
    }));
}

function _processTrafficStatus(successCallback) {
    _queryFB('X_AVM-DE_GetOnlineMonitor', function(data) {

        let chartDataDownstream = {};
        let chartDataUpstream = {};

        chartDataDownstream['max'] = parseInt(_grabFromXML('Newmax_ds', data)) || 0;
        chartDataUpstream['max']   = parseInt(_grabFromXML('Newmax_us', data)) || 0;

        let map = {
            downstream:         'Newds_current_bps',
            downstream_media:   'Newmc_current_bps',

            upstream:           'Newus_current_bps',
            upstream_realtime:  'Newprio_realtime_bps',
            upstream_high:      'Newprio_high_bps',
            upstream_normal:    'Newprio_default_bps',
            upstream_low:       'Newprio_low_bps'
        };

        oeach(map, function(id, xmlkey) {

            let chartData = chartDataDownstream;
            if (id.match(/^upstream/))
                chartData = chartDataUpstream;

            if (!chartData[id]) chartData[id] = [];

            let series = _grabFromXML(xmlkey, data).split(',').reverse();
            if (series.length == BufferSize) {
                oeach(series, function(idx, valstr) {
                    chartData[id][idx] = parseInt(valstr) || 0;
                });
            }
            else {
                // Can't parse, flatten series
                for (let i=0; i<BufferSize; i++) {
                    chartData[id][i] = 0;
                }
            }

        });
        
        successCallback(chartDataDownstream, chartDataUpstream);
    });
}


function _drawUpstreamCanvas() {

    let canvas = this;
    let ctx = canvas.get_context();

    if (!canvas.chartData) return;

    let maxBytes = Math.floor(canvas.chartData.max);

    let [width, height] = canvas.get_surface_size();
    if ((width % BufferSize) || (height <= 0)) return; // Paranoia

    // Paint background
    let backgroundColor = new Clutter.Color({ red:45, green:45, blue:45, alpha:255 });
    Clutter.cairo_set_source_color(ctx, backgroundColor);
    ctx.rectangle(0, 0, width, height);
    ctx.fill();

    let i,h;

    var top = canvas.chartData.upstream;

    oeach([
        {
            color: new Clutter.Color({ red:0, green:255, blue:0, alpha:255 }),
            sub: 'upstream_realtime'
        },
        {
            color: new Clutter.Color({ red:30, green:220, blue:30, alpha:255 }),
            sub: 'upstream_high'  
        },
        {
            color: new Clutter.Color({ red:60, green:190, blue:60, alpha:255 }),
            sub: 'upstream_normal'  
        },
        {
            color: new Clutter.Color({ red:90, green:160, blue:90, alpha:255 })
        }
        ], function(idx, obj) {

            ctx.moveTo(0, height);
            for (i=0; i<BufferSize; i++) {
                h = Math.floor(top[i] / (maxBytes / height));
                if (obj.sub) top[i] -= canvas.chartData[obj.sub][i];
                if (h > height) h = height;
                ctx.lineTo(i*3, height - h);
            }
            ctx.lineTo((i*3)+3, height - h);
            ctx.lineTo((i*3)+3, height);
            ctx.closePath();
            Clutter.cairo_set_source_color(ctx, obj.color);
            ctx.fill();

    });
}

function _drawDownstreamCanvas() {
    
    let canvas = this;
    let ctx = canvas.get_context();

    if (!canvas.chartData) return;

    let maxBytes = Math.floor(canvas.chartData.max);

    let [width, height] = canvas.get_surface_size();
    if ((width % BufferSize) || (height <= 0)) return; // Paranoia

    // Paint background
    let backgroundColor = new Clutter.Color({ red:45, green:45, blue:45, alpha:255 });
    Clutter.cairo_set_source_color(ctx, backgroundColor);
    ctx.rectangle(0, 0, width, height);
    ctx.fill();

    let i,h;

    let totalColor = new Clutter.Color({ red:255, green:216, blue:62, alpha:255 });
    ctx.moveTo(0, height);
    for (i=0; i<BufferSize; i++) {
        h = Math.floor(canvas.chartData.downstream[i] / (maxBytes / height));
        if (h > height) h = height;
        ctx.lineTo(i*3, height - h);
    }
    ctx.lineTo((i*3)+3, height - h);
    ctx.lineTo((i*3)+3, height);
    ctx.closePath();
    Clutter.cairo_set_source_color(ctx, totalColor);
    ctx.fill();

    let mediaColor = new Clutter.Color({ red:255, green:48, blue:0, alpha:255 });
    ctx.moveTo(0, height);
    for (i=0; i<BufferSize; i++) {
        h = Math.floor(canvas.chartData.downstream_media[i] / (maxBytes / height));
        if (h > height) h = height;
        ctx.lineTo(i*3, height - h);
    }
    ctx.lineTo((i*3)+3, height - h);
    ctx.lineTo((i*3)+3, height);
    ctx.closePath();
    Clutter.cairo_set_source_color(ctx, mediaColor);
    ctx.fill();
}


function _timer() {
 
    _processTrafficStatus(function(chartDataDownstream, chartDataUpstream) {
        CanvasUp.chartData = chartDataUpstream;
        CanvasDown.chartData = chartDataDownstream;

        CanvasUp.queue_repaint();
        CanvasDown.queue_repaint();
    });

    return true;
}


function init() {
    // Soup session handle
    SoupSession = new Soup.SessionAsync();

    SoupAuthManager = new Soup.AuthManager();
    SoupAuth = new Soup.AuthBasic({host: 'fritz.box', realm: 'fritzbox'});

    // Handle to our gschema settings
    Settings = Convenience.getSettings();
}


function enable() {
    // Just guessing. Is there a better way?
    let FontSize = Math.round(Panel.PANEL_ICON_SIZE);

    // Main "button" and layout. Gets added to the panel.
    FrameButton = new PanelMenu.Button(0.5);
    let layout = new St.BoxLayout({ style_class: 'um-widget' });
    FrameButton.actor.add_actor(layout);

    // Upstream label and canvas
    layout.add(new St.Label({ text: "↑", style: "font-size:"+FontSize+"px;" }), { y_align: St.Align.MIDDLE, y_fill: false });
    CanvasUp = new St.DrawingArea({style_class: 'um-chart-up', reactive: false});
    CanvasUp.set_width(BufferSize*3);
    CanvasUp.charts = {

    };
    layout.add(CanvasUp);

    // Downstream label and canvas
    layout.add(new St.Label({ text: "↓", style: "font-size:"+FontSize+"px;" }), { y_align: St.Align.MIDDLE, y_fill: false });
    CanvasDown = new St.DrawingArea({style_class: 'um-chart-down', reactive: false});
    CanvasDown.set_width(BufferSize*3);
    layout.add(CanvasDown);

    // Popup info 
    PrefsButton = new PopupMenu.PopupBaseMenuItem({ style_class: 'um-infopopup-item' });
    PrefsButton.actor.add(new St.Label({ text: "Preferences ..." }));

    //FrameButton.menu.addMenuItem(infoPopup);
    FrameButton.menu.addMenuItem(PrefsButton);

    // Repaint graphs
    CanvasUp.connect('repaint', Lang.bind(CanvasUp, _drawUpstreamCanvas));
    CanvasDown.connect('repaint', Lang.bind(CanvasDown, _drawDownstreamCanvas));

    // Lauch preferences from popup menu
    let appSys = Shell.AppSystem.get_default();
    let gsePrefs = appSys.lookup_app('gnome-shell-extension-prefs.desktop');
    PrefsButton.connect('activate', function () {
        if (gsePrefs.get_state() == gsePrefs.SHELL_APP_STATE_RUNNING){
            gsePrefs.activate();
        }
        else {
            let info = gsePrefs.get_app_info();
            let timestamp = global.display.get_current_time_roundtrip();
            info.launch_uris([Me.metadata.uuid], global.create_app_launch_context(timestamp, -1));
        }
    });

    // Add everything to panel
    Main.panel._addToPanelBox('fritzbox-uplink-monitor', FrameButton, 0, Main.panel._rightBox);

    // Start updating
    IntervalTimer = Mainloop.timeout_add_seconds(2, _timer);
}


function disable() {
    Settings.run_dispose();

    // Remove everything from panel
    Main.panel._rightBox.remove_actor(FrameButton.container);

    // Remove timer
    Mainloop.source_remove(IntervalTimer);
}
