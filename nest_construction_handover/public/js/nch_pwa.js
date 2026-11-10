// Makes the site installable as a phone app (Chrome menu > Install app / Add to Home screen).
// Loaded on desk and website pages. Install only: there is no service worker, so nothing
// works offline yet; offline capture is a later phase.
(function () {
	try {
		if (document.querySelector('link[rel="manifest"]')) return;
		var link = document.createElement("link");
		link.rel = "manifest";
		link.href = "/assets/nest_construction_handover/pwa/manifest.json";
		document.head.appendChild(link);

		var icon = document.createElement("link");
		icon.rel = "apple-touch-icon";
		icon.href = "/assets/nest_construction_handover/pwa/icon-192.png";
		document.head.appendChild(icon);
	} catch (e) {
		/* never break the page */
	}
})();
