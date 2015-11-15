const Lang = imports.lang;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const FritzboxUplinkMonitorSettingsWidget = new GObject.Class({
	Name: 'FritzboxUplinkMonitor.Prefs.FritzboxUplinkMonitorSettingsWidget',
	GTypeName: 'FritzboxUplinkMonitorSettingsWidget',
	Extends: Gtk.Box,

	_init: function(params) {
		this.parent(params);

		this._settings = Convenience.getSettings();

		let builder = new Gtk.Builder();
		builder.add_from_file(Me.path + '/prefs.glade');

		this.pack_start(builder.get_object('mainAlignment'), true, true, 0);

		this._totalColorButton = builder.get_object('totalColorButton');
		this._otherColorButton = builder.get_object('otherColorButton');
		this._backgroundColorButton = builder.get_object('backgroundColorButton');

		this._totalColorButton.connect("color-set", Lang.bind(this, function() {
			this._settings.set_string('total-color', this._totalColorButton.rgba.to_string());
			this._updateTotalColorButton();
		}));
		this._otherColorButton.connect("color-set", Lang.bind(this, function() {
			this._settings.set_string('other-color', this._otherColorButton.rgba.to_string());
			this._updateOtherColorButton();
		}));
		this._backgroundColorButton.connect("color-set", Lang.bind(this, function() {
			this._settings.set_string('background-color', this._backgroundColorButton.rgba.to_string());
			this._updateBackgroundColorButton();
		}));

		this._updateTotalColorButton();
		this._updateOtherColorButton();
		this._updateBackgroundColorButton();

		let fritzboxIpEntry = builder.get_object('fritzboxIpEntry');
		let chartWidthSpinButton = builder.get_object('chartWidthSpinButton');

		fritzboxIpEntry.connect('changed', Lang.bind(this, function() {
			let match = fritzboxIpEntry.get_text().trim().match(/^([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})$/i);
			if (match !== null) this._settings.set_string('fritzbox-ip', match[1]);
		}));
		this._settings.bind('fritzbox-ip', fritzboxIpEntry, "text", Gio.SettingsBindFlags.DEFAULT);

		chartWidthSpinButton.connect('value-changed', Lang.bind(this, function(button) {
            this._settings.set_uint('chart-width', button.get_value_as_int());
        }));

		chartWidthSpinButton.set_value(this._settings.get_uint('chart-width'));
	},

	_parseRgbaColor: function (spec) {
		let col = new Gdk.RGBA();
		col.parse(spec);
		return col;
	},

	_updateTotalColorButton: function() {
        this._totalColorButton.set_rgba(this._parseRgbaColor(this._settings.get_string('total-color')));
    },
    _updateOtherColorButton: function() {
        this._otherColorButton.set_rgba(this._parseRgbaColor(this._settings.get_string('other-color')));
    },
    _updateBackgroundColorButton: function() {
        this._backgroundColorButton.set_rgba(this._parseRgbaColor(this._settings.get_string('background-color')));
    }


});


function init() {

};

function buildPrefsWidget() {
	let widget = new FritzboxUplinkMonitorSettingsWidget();
	widget.show_all();
	return widget;
};
