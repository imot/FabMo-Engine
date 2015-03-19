/*
 * This is where the application context that we will expose to the "apps" will go
 * This will include the currently selected machine (if any) as well as functions to interact with the dashboard itself.
 * This is different than the context provided by context.js, which is the context for the entire dashboard, not just
 * the parts that we want the app to see.
 */
define(function(require) {

	var Dashboard = function(target) {
		this.machine = null;
		this.ui = null;

		this.keyCommands();
		this.checkDashboardSettings();

		//Refresh of the tool status on the dashboard
		this.refresh = 500; // define the tool connection refresh time (ms)
		setInterval(this.updateStatus.bind(this),this.refresh);

		this.target = target || window;
		this.handlers = {};
		this.events = {
			'status' : []
		};
		this._registerHandlers();
		this._setupMessageListener();
	};

	// Register a handler function for the provided message type
	Dashboard.prototype._registerHandler = function(name, handler) {
		if('message' in this.handlers) {
			throw ('Already registered a handler for the "' + name + '" message.')
		}
		this.handlers[name] = handler;
	}

	// Register a handler assuming that the message type is concurrent with a method name in the dashboard object (as is common)
	Dashboard.prototype._registerHandlerByName = function(name) {
		var proto = Object.getPrototypeOf(this);
		if(name in proto) {
			this.handlers[name] = proto[name];
		}
	}

	// The events member is a mapping of event type to sources and ids which map back to functions in the client dashboard
	Dashboard.prototype._registerEventListener = function(name, source) {
		if(name in this.events) {
			listeners = this.events[name];
			for(var i in listeners) {
				if(listeners[i] == source) { return; }
			}
			this.events[name].push(source);
		}
	}

	Dashboard.prototype._fireEvent = function(name, data) {
		if(name in this.events) {
			listeners = this.events[name];
			for(var i in listeners) {
				var source = listeners[i];
				var msg = {"status" : "success", "type" : "evt", "id" : name, "data" : data};
				//console.log("Dashboard host: Firing event to " + source + " with the following data: " + JSON.stringify(msg))
				source.postMessage(msg, "*");
			}
		}
	}

	Dashboard.prototype._setupMessageListener = function() {
		this.target.addEventListener('message', function(evt) {
			var source = evt.source;
			if('call' in evt.data) {
				var func = evt.data.call;
				if(func in this.handlers) {
					var handler = this.handlers[func];
					var data = evt.data.data;
					var id = evt.data.id >= 0 ? evt.data.id : -1;
					var msg;
					try {
						handler(data, function(err, data) {
							var msg;
							if(err) {
								msg = {"status" : "error", "type" : "cb", "message" : JSON.stringify(err) , "id" : id}
							} else {
								msg = {	"status" : "success", 
										"type" : "cb", 
										"data" : data, 
										"id" : id }
							}
							source.postMessage(msg, evt.origin);
						});
					} catch(e) {
						var msg = {"status" : "error", "type" : "cb", "message" : JSON.stringify(e) , "id" : id}
						source.postMessage(JSON.stringify(msg), evt.origin);
					}
				}
			} else if('on' in evt.data) {
				var name = evt.data.on;
				var source = evt.source;
				this._registerEventListener(name, source);
			}
		}.bind(this));
	}

	Dashboard.prototype._registerHandlers = function() {
		
		// Show the DRO
		this._registerHandler('showDRO', function(data, callback) { 
			this.openRightMenu();
			callback(null);
		}.bind(this));

		// Hide the DRO
		this._registerHandler('hideDRO', function() { 
			this.closeRightMenu() 
			callback(null)
		}.bind(this));

		// Submit a job
		this._registerHandler('submitJob', function(data, callback) { 
			if('file' in data) {
				
				formdata = new FormData();
				formdata.append('file', data.file, data.file.name);
				
				this.machine.add_job(formdata, function(err, result) {
					if(err) {
						callback(err);
					} else {
						this.jobManager();
						callback(null);
					}
				}.bind(this));
			} else if ('data' in data) {
				this.machine.add_job(data, function(err, result) {
					if(err) {
						callback(err);
					} else {
						this.jobManager();
						callback(null);
					}
				}.bind(this));				
			}
		}.bind(this));

		this._registerHandler('resubmitJob', function(id, callback) { 
			this.machine.resubmit_job(id, function(err, result) {
				if(err) {
					callback(err);
				} else {
					this.jobManager();
					callback(null);
				}
			}.bind(this));
		}.bind(this));

		// Get the list of jobs in the queue
		this._registerHandler('getJobsInQueue', function(data, callback) {
			this.machine.list_jobs_in_queue(function(err, jobs) {
				if(err) {
					callback(err);
				} else {
					callback(null, jobs);
				}
			})
		}.bind(this));

		this._registerHandler('getJobHistory', function(data, callback) {
			this.machine.get_job_history(function(err, jobs) {
				if(err) {
					callback(err);
				} else {
					callback(null, jobs);
				}
			})
		}.bind(this));

		this._registerHandler('clearJobQueue', function(data, callback) {
			this.machine.clear_job_queue(function(err) {
				if(err) {
					callback(err);
				} else {
					callback(null);
				}
			})
		}.bind(this));

		this._registerHandler('runNext', function(data, callback) {
			this.machine.job_run(function(err, result) {
				if(err) { callback(err); }
				else { callback(null); }
			});
		}.bind(this));

		this._registerHandler('pause', function(data, callback) {
			this.machine.pause(function(err, result) {
				if(err) { callback(err); }
				else { callback(null); }
			});
		}.bind(this));

		this._registerHandler('stop', function(data, callback) {
			this.machine.quit(function(err, result) {
				if(err) { callback(err); }
				else { callback(null); }
			});
		}.bind(this));

		this._registerHandler('resume', function(data, callback) {
			this.machine.resume(function(err, result) {
				if(err) { callback(err); }
				else { callback(null); }
			});
		}.bind(this));

		this._registerHandler('nudge', function(data, callback) {
			this.machine.fixed_move(data.dir, data.dist, function(err, result) {
				if(err) { callback(err); }
				else { callback(null); }
			});
		}.bind(this));

		this._registerHandler('getApps', function(data, callback) {
			this.machine.list_apps(function(err, result) {
				if(err) { callback(err); }
				else { callback(null, result); }
			});
		}.bind(this));

		// Submit an app
		this._registerHandler('submitApp', function(data, callback) { 
			if('file' in data) {
				formdata = new FormData();
				formdata.append('file', data.file, data.file.name);

				this.machine.submit_app(formdata, function(err, result) {
					this.refreshApps();
					if(err) {
						callback(err);
					} else {
						callback(null, result);
					}
				}.bind(this));
			} else if ('data' in data) {
				this.machine.add_job(data, function(err, result) {
					if(err) {
						callback(err);
					} else {
						callback(null);
					}
				}.bind(this));
			}
		}.bind(this));

		this._registerHandler('deleteApp', function(id, callback) {
			this.machine.delete_app(id, function(err, result) {
				this.refreshApps();
				if(err) { callback(err); }
				else { callback(null, result); }
			}.bind(this));
		}.bind(this));

		this._registerHandler('runGCode', function(text, callback) {
			this.machine.gcode(text, function(err, result) {
				if(err) { callback(err); }
				else { callback(null, result); }
			}.bind(this));
		}.bind(this));

		this._registerHandler('runSBP', function(text, callback) {
			this.machine.sbp(text, function(err, result) {
				if(err) { callback(err); }
				else { callback(null, result); }
			}.bind(this));
		}.bind(this));

		this._registerHandler('getConfig', function(data, callback) {
			this.machine.get_config(function(err, result) {
				if(err) { callback(err); }
				else { callback(null, result); }
			}.bind(this));
		}.bind(this));

		this._registerHandler('setConfig', function(data, callback) {
			this.machine.set_config(data, function(err, result) {
				if(err) { callback(err); }
				else { callback(null, result); }
			}.bind(this));
		}.bind(this));
	
	}

	/*** Prototypes ***/
	Dashboard.prototype.updateStatus = function(){
		//if (this.ui.tool.status == )
		if(this.ui) {
			if(this.ui.tool.state) {
				this._fireEvent("status", this.ui.tool.status_report);
			}
		}
	};

	// Brings up the DRO (if separate from the keypad) in the dashboard
	Dashboard.prototype.DRO = function(callback){
		if(!callback) {
			return console.log("This function 'DRO' needs a callback to run");
		}
		else {
			that=this;
			that.notification('info','Move the tool if necessary, then hit "Enter');
			that.openRightMenu(); //Open the menu to let the user control the tool

			//Waiting keydown on "enter" key, before calling callback.
			var key=$(document).keydown(function(e){
				if ((e.which == 13)) {
					if(typeof callback === 'function') callback(key);
				}
			});
		}
		return;
	};

	//Open the right menu
	Dashboard.prototype.openRightMenu = function() {
		that=this;
		$("#main").addClass("offcanvas-overlap-left");
		if(that.machine) {
			that.ui.setMenuOpen();
		}
		resizedoc();
	}

	//Close the right menu
	Dashboard.prototype.closeRightMenu = function() {
		that=this;
		$("#main").removeClass("offcanvas-overlap-left");
		if(that.machine) {
			that.ui.setMenuClosed();
		}
		resizedoc();
	}

	// Open and close the right menu
	Dashboard.prototype.bindRightMenu = function(mouv) {
		that=this;
		if($("#main").hasClass("offcanvas-overlap-left")){
			if(mouv) {
				that.closeRightMenu();
			}
			else {
				that.ui.setMenuClosed();
			}
		}
		else {
			if(mouv){
				that.openRightMenu();
			}
			else {
				that.ui.setMenuOpen();
			}
		}
	}

	// React to keydown on "k" shortcut, show / hide right menu and show keypad if allowed
	Dashboard.prototype.keyCommands = function(){
		that=this;
		$(document).keydown(function(e){
			if (e.which == 75) {
				that.keypad(true,true);
			}

			//Development only : Run the DRO function with a callback, with "d" shortcode
			if (e.which == 68) {
				that.DRO(function(ev){
					that.closeRightMenu();
					that.notification("success","DRO Worked");
					ev=null;
				});
			}
		});

		$(".right-small").click( function() {
			that.keypad(true,false);
			resizedocclick();
		});
	};

	Dashboard.prototype.keypad = function(test,mouv) {
		that=this;
		if (that.machine) {
			if(that.ui.statusKeypad() && test) {
				that.bindRightMenu(mouv);
			}
			else that.notification("error","KeyPad Unvailable");
		}
		else that.notification("warning","Please Connect to a tool");
	};

	Dashboard.prototype.notification = function(type,message) {
		if(type=='info') 			toastr.info(message);
		else if (type=="success") 	toastr.success(message);
		else if (type=="warning") 	toastr.warning(message);
		else if (type=="error") 	toastr.error(message);
		else console.log("Unknown type of notification");
	}

	Dashboard.prototype.jobManager = function() {
		context = require('context');
		context.launchApp('job-manager');
	}

	Dashboard.prototype.refreshApps = function() {
		context = require('context');
		context.apps.fetch();
	}

	Dashboard.prototype.checkDashboardSettings = function() {
		var that=this;
		 var s=JSON.parse(localStorage.getItem('dashboardSettings'));

        if (s == null) {
          console.log("No Settings Defined, Load defaults settings");
          //Load Default Settings into S variable
          s={
			"appName": {
				"name":"DashBoard Name",
				"value":"FabMo Dashboard",
				"type":"text"
			},
			"mainColor": {
				"name":"Main Color (top-bar...)",
				"value":"#313366",
				"type":"color",
				"colors": ["#54ba4c","#313366","#dd8728","#9c210c","#444"]
			},
			"secondColor": {
				"name":"Secondary color (menu...)",
				"value":"#444",
				"type":"color",
				"colors": ["#54ba4c","#313366","#dd8728","#9c210c","#444"]
			},
			"positionBackground": {
				"name":"Main Dashboard Color",
				"value":"#9c210c",
				"type":"color",
				"colors": ["#54ba4c","#313366","#dd8728","#9c210c","#111"]
			},
			"positionFront": {
				"name":"Main Dashboard Color",
				"value":"#9c210c",
				"type":"color",
				"colors": ["#54ba4c","#313366","#dd8728","#9c210c","#111"]
			},
			"keypadBackground": {
				"name":"Main Dashboard Color",
				"value":"#dd8728",
				"type":"color",
				"colors": ["#54ba4c","#313366","#dd8728","#9c210c","#111"]
			},
			"keypadFront": {
				"name":"Main Dashboard Color",
				"value":"#9c210c",
				"type":"color",
				"colors": ["#54ba4c","#313366","#dd8728","#9c210c","#111"]
			},
			"leftMenuDefaultColapsed": {
				"name":"Colapsed Left Menu",
				"value":true,
				"type":"checkbox"
			}
		};
        localStorage.setItem('dashboardSettings',JSON.stringify(s));
      }

      this.updateDashboardSettings();
	}

	Dashboard.prototype.updateDashboardSettings = function() {
		var s=JSON.parse(localStorage.getItem('dashboardSettings'));

        if (s != null) {
        	$("#dashboardName").html(s.appName.value);
        	$("title").html(s.appName.value);
        }
	};

	Dashboard.prototype.resetDashboardSettings = function() {
		localStorage.setItem('dashboardSettings',null);
		this.checkDashboardSettings();
	}

	// The dashboard is a singleton which we create here and make available as this module's export.
	var dashboard = new Dashboard();
	
	return dashboard

});