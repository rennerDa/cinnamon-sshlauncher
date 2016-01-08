const Applet = imports.ui.applet;
const Cinnamon = imports.gi.Cinnamon;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const PopupMenu = imports.ui.popupMenu;
const St = imports.gi.St;
const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;
const Gio = imports.gi.Gio;
const ModalDialog = imports.ui.modalDialog;
const Clutter = imports.gi.Clutter;
const CinnamonEntry = imports.ui.cinnamonEntry;

const Sjcl = imports.applet.sjcl;

function MyMenu(launcher, orientation) {
    this._init(launcher, orientation);
}

MyMenu.prototype = {
    __proto__: PopupMenu.PopupMenu.prototype,
    _init: function(launcher, orientation) {
        this._launcher = launcher;
        PopupMenu.PopupMenu.prototype._init.call(this, launcher.actor, 0.0, orientation, 0);
        Main.uiGroup.add_actor(this.actor);
        this.actor.hide();
    }
};

function SshEntryDialog() {
    this._init();
}

SshEntryDialog.prototype = {
	__proto__: ModalDialog.ModalDialog.prototype,
    _init : function() {
    	ModalDialog.ModalDialog.prototype._init.call(this, {});

		let hostLabel = new St.Label({ text: _("Please enter Host:") });

        this.contentLayout.add(hostLabel, { y_align: St.Align.START });

    	let hostInput = new St.Entry();
        CinnamonEntry.addContextMenu(hostInput);

        hostInput.label_actor = hostLabel;

        this.hostInput = hostInput.clutter_text;
        this.contentLayout.add(hostInput, { y_align: St.Align.START });

		let hostNameLabel = new St.Label({ text: _("Please enter HostName (URL):") });

        this.contentLayout.add(hostNameLabel, { y_align: St.Align.START });

    	let hostNameInput = new St.Entry();
        CinnamonEntry.addContextMenu(hostNameInput);

        hostNameInput.label_actor = hostNameLabel;

        this.hostNameInput = hostNameInput.clutter_text;
        this.contentLayout.add(hostNameInput, { y_align: St.Align.START });

        let userLabel = new St.Label({ text: _("Please enter User:") });

        this.contentLayout.add(userLabel, { y_align: St.Align.START });

    	let userInput = new St.Entry();
        CinnamonEntry.addContextMenu(userInput);

        userInput.label_actor = userLabel;

        this.userInput = userInput.clutter_text;
        this.contentLayout.add(userInput, { y_align: St.Align.START });

        let encryptionKeyLabel = new St.Label({ text: _("Please enter encryption key:") });

        this.contentLayout.add(encryptionKeyLabel, { y_align: St.Align.START });

    	let encryptionKeyInput = new St.Entry();
        CinnamonEntry.addContextMenu(encryptionKeyInput);

        encryptionKeyInput.label_actor = encryptionKeyLabel;

        this.encryptionKeyInput = encryptionKeyInput.clutter_text;
        this.contentLayout.add(encryptionKeyInput, { y_align: St.Align.START });

        this.setInitialKeyFocus(this.hostInput);
    },

    getHost: function() {
    	return this.hostInput.get_text();
    },
};

function MyApplet(metadata, orientation) {
	this._init(metadata, orientation);
};

MyApplet.prototype = {

	__proto__: Applet.IconApplet.prototype,

    _init: function(metadata, orientation) {
        Applet.IconApplet.prototype._init.call(this, orientation);

		try {
			this.set_applet_icon_name("network");
			this.menuManager = new PopupMenu.PopupMenuManager(this);
            this.menu = new MyMenu(this, orientation);
            this.menuManager.addMenu(this.menu);
            this.appletPath = metadata.path;
            this.sshHeadless = false;
            this.sshForwardX = false;
            this.homeDir = GLib.get_home_dir();
            this.msgSource = new MessageTray.SystemNotificationSource("SSH Launcher");
            Main.messageTray.add(this.msgSource);
            let file = Gio.file_new_for_path(this.homeDir + "/.ssh/config"); 
            this.monitor = file.monitor_file(Gio.FileMonitorFlags.NONE, new imports.gi.Gio.Cancellable(), null); 
            this.monitor.connect("changed", Lang.bind(this, this.updateMenu));			
            this.updateMenu();
		}
		catch (e) {
			global.logError(e);
		}
	},
	
	updateMenu: function() {
		this.menu.removeAll();
		let menuitemHeadless = new PopupMenu.PopupSwitchMenuItem("Background (-fN)");
		menuitemHeadless.connect('activate', Lang.bind(this, this.toggleHeadless));
		this.menu.addMenuItem(menuitemHeadless);
		let menuitemForwardX = new PopupMenu.PopupSwitchMenuItem("Forward X11 (-X)");
		menuitemForwardX.connect('activate', Lang.bind(this, this.toggleForwardX));
		this.menu.addMenuItem(menuitemForwardX);
		
		this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
		
		try {
			let [res, out, err, status] = GLib.spawn_command_line_sync('grep "^Host " .ssh/config');
			if(out.length!=0) {
				let hosts = out.toString().split("\n");
				for(let i=0; i<hosts.length; i++) {
					let host = hosts[i];
					if(host != "") {
						let hostname = host.replace("Host ", "");
						let item = new PopupMenu.PopupMenuItem(hostname);
						item.connect('activate', Lang.bind(this, function() { this.connectTo(hostname); }));
						this.menu.addMenuItem(item);
					}
				}
			}
		} catch(e) {
			this.menu.addMenuItem(new PopupMenu.PopupMenuItem("ERROR. " + e, { reactive: false }));
		}
		this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
		
		let menuitemEdit = new PopupMenu.PopupMenuItem("Edit SSH config");
		menuitemEdit.connect('activate', Lang.bind(this, this.editConfig));
		this.menu.addMenuItem(menuitemEdit);

		this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
		
		let menuitemEdit2 = new PopupMenu.PopupMenuItem("Encrypt SSH Password");
		menuitemEdit2.connect('activate', Lang.bind(this, this.encryptSshPassword));
		this.menu.addMenuItem(menuitemEdit2);

		this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

		let menuitemUpdate = new PopupMenu.PopupMenuItem("Force Update from SSH config");
		menuitemUpdate.connect('activate', Lang.bind(this, this.updateMenu));
		this.menu.addMenuItem(menuitemUpdate);
	},

	encryptSshPassword: function() {
		let dialog = new SshEntryDialog();
		let me = this;
		dialog.setButtons([
		    {
		        label: _("Cancel"),
		        action: Lang.bind(me, function() {
		        	dialog.close();
		        }),
		        key: Clutter.Escape
		    },
		    {
		        label: _("OK"),
		        action: Lang.bind(me, function() {
		        	let p = { 
		        		adata: '',
				        iter: 1000,
				        mode: 'ccm',
				        ts: 128,
				        ks: 256
				    };
				    p.iv = Sjcl.sjcl.random.randomWords(4, 0);
				    p.salt = Sjcl.sjcl.random.randomWords(2, 0);

		        	let password = dialog.getHost();
		        	password = Sjcl.sjcl.encrypt('Jennyfer', password, p, {}).replace(/,/g,",\n");
		        	let encodedPassword = GLib.base64_encode(password);
		        	me.actionAfterTest(encodedPassword);
		        	dialog.close();
		        }),
		        key: Clutter.Return
		    }
		]);

		dialog.open();
	},

	actionAfterTest: function(encryptedPassword) {
		let clipboard = St.Clipboard.get_default();
		clipboard.set_text(encryptedPassword);
		this.msgSource.notify(new MessageTray.Notification(this.msgSource, "SSH Launcher", "Password encrypted, copied " + encryptedPassword + " to clipboard."));
	},

	getPasswords: function() {
		let pwdMap = {};
		try {
			let [res, out, err, status] = GLib.spawn_command_line_sync('cat .ssh/pwd');
			if(out.length==0) {
				return pwdMap;
			}
			let pwds = out.toString().split("\n");
			for(let i=0; i<pwds.length; i++) {
				let pwdLine = pwds[i];
				let hostPwdCombination = pwdLine.split(";");
				pwdMap[hostPwdCombination[0]] = hostPwdCombination[1];
			}
		} catch(e) {
			this.msgSource.notify(new MessageTray.Notification(this.msgSource, "SSH Launcher", "Error reading Password File"));
		}
		return pwdMap;
	},
	
	connectTo: function(hostname) {
		let flags = "";
		if (this.sshHeadless) {
			flags = " -fN ";
		}
		if (this.sshForwardX) {
			flags = " -X " + flags;
		}

		let passwords = this.getPasswords();
		if (hostname in passwords) {
			let encrypted_password = GLib.base64_decode(passwords[hostname]);
			Main.Util.spawnCommandLine("gnome-terminal -x sshpass -p '" + encrypted_password + "' ssh " + flags + ' -o StrictHostKeyChecking=no ' + hostname);
		} else {
			Main.Util.spawnCommandLine("gnome-terminal -x ssh " + flags + ' -o StrictHostKeyChecking=no ' + hostname);
		}

		let notification = new MessageTray.Notification(this.msgSource, "SSH Launcher", "Connection opened to " + hostname);
		notification.setTransient(true);
		this.msgSource.notify(notification);
	},
	
	editConfig: function() {
		GLib.spawn_command_line_async(this.appletPath + "/launch_editor.sh");
	},
	
	on_applet_clicked: function(event) {
		this.menu.toggle();
	},
	
	toggleHeadless: function(event) {
		this.sshHeadless = event.state;
	},
	
	toggleForwardX: function(event) {
		this.sshForwardX = event.state;
	}
};

function main(metadata, orientation) {
	let myApplet = new MyApplet(metadata, orientation);
	return myApplet;
}

