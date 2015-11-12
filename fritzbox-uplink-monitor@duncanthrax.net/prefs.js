//const GLib = imports.gi.GLib;
//const GObject = imports.gi.GObject;
//const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
//const Lang = imports.lang;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

function init() {

};

function buildPrefsWidget() {
  let builder = new Gtk.Builder();
  if (builder.add_from_file(Me.path + '/prefs.glade') == 0) return null;

  return builder.get_object('mainAlignment');
};
