// On a phone, open the person's own field screen instead of the desk home page.
//
// The server works out where that is (frappe.boot.nch_mobile_home, see mobile.py):
// van techs, the storeman and site managers get Van & Site Stock, approvers the
// Approval Inbox, buyers PO Request. Admins get nothing, so they keep the home page.
//
// It acts once, on a fresh load that lands on the home page (sign-in, refresh, the app
// icon). A link to anything else is left alone, and tapping Home later still shows the
// home page, so nobody is ever locked out of the desk.

(function () {
	var PHONE = "(max-width: 767px)";
	var WINDOW_MS = 3000; // only during the first few seconds after the desk loads
	var loaded_at = Date.now();
	var done = false;

	function on_home() {
		var r = frappe.get_route() || [];
		if (r.length === 0 || r[0] === "" || r[0] == null) return true;
		return r.length === 1 && r[0] === "nest-home";
	}

	function go() {
		try {
			if (done || Date.now() - loaded_at > WINDOW_MS) return;
			var target = frappe.boot && frappe.boot.nch_mobile_home;
			if (!target || !window.matchMedia(PHONE).matches || !on_home()) return;
			done = true;
			if (target.indexOf("/desk/") === 0) {
				frappe.set_route(target.slice("/desk/".length).split("/"));
			} else {
				window.location.assign(target);
			}
		} catch (e) {
			/* never break the desk */
		}
	}

	// nest_home moves an empty landing to nest-home on app_ready and again at 800 ms;
	// both count as home here, so whichever runs first, the phone screen wins.
	$(document).on("app_ready", function () {
		setTimeout(go, 50);
	});
	setTimeout(go, 1000);
	setTimeout(go, 2200);
})();
