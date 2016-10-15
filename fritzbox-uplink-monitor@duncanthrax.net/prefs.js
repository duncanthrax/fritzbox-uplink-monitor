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

		this.pack_start(builder.get_object('mainBox'), true, true, 0);

		let fritzboxIpEntry = builder.get_object('fritzboxIpEntry');
		let fritzboxUsernameEntry = builder.get_object('fritzboxUsernameEntry');
		let fritzboxPasswordEntry = builder.get_object('fritzboxPasswordEntry');

		fritzboxIpEntry.connect('changed', Lang.bind(this, function() {
			var text = fritzboxIpEntry.get_text().trim();
			if (!text) { 
				this._settings.set_string('fritzbox-ip', '');
				return;
			}
			let match = text.match(/^([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})$/i);
			if (match !== null) this._settings.set_string('fritzbox-ip', match[1]);
		}));
		fritzboxIpEntry.set_text(this._settings.get_string('fritzbox-ip'));

		fritzboxUsernameEntry.connect('changed', Lang.bind(this, function() {
			var text = fritzboxUsernameEntry.get_text().trim();
			if (!text) { 
				this._settings.set_string('fritzbox-username', '');
				return;
			}
			let match = text.match(/^([A-Za-z0-9]+)$/i);
			if (match !== null) this._settings.set_string('fritzbox-username', match[1]);
		}));
		fritzboxUsernameEntry.set_text(this._settings.get_string('fritzbox-username'));

		fritzboxPasswordEntry.connect('changed', Lang.bind(this, function() {
			var text = fritzboxPasswordEntry.get_text().trim();
			if (!text) { 
				this._settings.set_string('fritzbox-password', '');
				return;
			}
			let match = text.match(/^(.+)$/i);
			if (match !== null) this._settings.set_string('fritzbox-password', match[1]);
		}));
		fritzboxPasswordEntry.set_text(this._settings.get_string('fritzbox-password'));

	}

});

function init() {};

function buildPrefsWidget() {
	let widget = new FritzboxUplinkMonitorSettingsWidget();
	widget.show_all();
	return widget;
};
