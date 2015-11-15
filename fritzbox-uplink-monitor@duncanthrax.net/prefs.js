const Lang = imports.lang;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
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
	}

});


function init() {

};

function buildPrefsWidget() {
	let widget = new FritzboxUplinkMonitorSettingsWidget();
	widget.show_all();
	return widget;
};
