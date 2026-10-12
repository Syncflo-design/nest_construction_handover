// Van & Site Stock: the main store, the vans and the sites on one phone screen.
//
// Who you are comes from your user's Assigned Warehouse: the main store, a van or a site
// (a site manager also works every site they manage). A handover is a Stock Handover
// Docket: the giver lists what is going, the receiver counts what arrived and accepts it,
// and only then does stock move, as one Stock Entry for what was counted. Used on site is
// a Material Issue against the site's project. All of it is built by
// nest_construction_handover/field.py with the user's own permissions.
//
// Desk Page: mounts inside page.body (jQuery in v16, CoWork_Helper gotcha 2026-05-10).
// HTML is built as string arrays joined with "\n" (page-bundle rule).
// Bump BUILD_MARKER with every CSS change (gotcha 2026-08-18).

frappe.pages['van-site-stock'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({ parent: wrapper, title: __('Van & Site Stock'), single_column: true });

	var BUILD_MARKER = 'v0.1.0-2026-10-12-first';
	console.log('Van & Site Stock loaded:', BUILD_MARKER);

	[
		['ch-stylesheet', '/assets/nest_construction_handover/css/van_site_stock.css'],
		['ch-phosphor', '/assets/nest_construction_handover/vendor/phosphor/style.css']
	].forEach(function(css) {
		if (document.getElementById(css[0])) return;
		var link = document.createElement('link');
		link.id = css[0];
		link.rel = 'stylesheet';
		link.href = css[1] + '?v=' + encodeURIComponent(BUILD_MARKER);
		document.head.appendChild(link);
	});

	wrapper.chStock = new ChStock(page);
};

frappe.pages['van-site-stock'].on_page_show = function(wrapper) {
	if (wrapper.chStock) wrapper.chStock.on_show();
};

// ---------------------------------------------------------------------------

var CH_API = 'nest_construction_handover.field.';

// The order a van's compartments are shown in, and taken from when stock leaves the van:
// project stock first, then wherever the item is.
var CH_COMPARTMENTS = ['Goods In Transit', 'Van Stock', 'Technician Tools', 'Assets'];

function ch_esc(s) {
	var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
	return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return map[c]; });
}

// Quantities as people say them: 25, not 25.000.
function ch_qty(value) {
	return String(parseFloat(flt(value).toFixed(4)));
}

function ch_icon(name) {
	return '<i class="ph ph-' + name + '" aria-hidden="true"></i>';
}

function ch_when(value) {
	if (!value) return '';
	return frappe.datetime.prettyDate ? frappe.datetime.prettyDate(value) : frappe.datetime.str_to_user(value);
}

function ch_lines(n) {
	return n === 1 ? __('1 item') : __('{0} items', [n]);
}

// The places someone picked last, per screen, so the second handover of a shift is three
// taps. A locked-down browser is not a reason to stop working.
function ch_remembered(key) {
	try { return localStorage.getItem('van-site-stock:' + key) || ''; } catch (e) { return ''; }
}

function ch_remember(key, value) {
	try { localStorage.setItem('van-site-stock:' + key, value || ''); } catch (e) { /* storage blocked */ }
}

function ch_call(method, args, freeze) {
	return frappe.call({
		method: CH_API + method,
		args: args || {},
		freeze: !!freeze,
		freeze_message: freeze ? __('Recording...') : undefined
	}).then(function(r) { return r.message; });
}

// The four ways stock is handed over, and what each needs.
var CH_SENDS = {
	'to-van': { title: __('Send to a van'), to: 'vans', into_van: true, project: true },
	'to-site': { title: __('Deliver to a site'), to: 'sites', out_of_van: true },
	'to-store': { title: __('Back to the store'), to: 'stores', out_of_van: true },
	'site-to-van': { title: __('Back on a van'), to: 'vans', into_van: true }
};

class ChStock {

	constructor(page) {
		this.page = page;
		this.ctx = null;
		this.basket = [];
		this.screen = null;
		this.$root = $('<div class="ch-root"></div>').appendTo(page.body);
		var $head = page.head ? $(page.head) : $(page.wrapper).find('.page-head');
		if ($head && $head.length) $head.hide();
		this.load().then(() => this.open_route(), () => this.no_entry());
	}

	load() {
		return ch_call('bootstrap').then((ctx) => { this.ctx = ctx; });
	}

	no_entry() {
		this.render([
			'<div class="ch-note">' + __('This screen could not open for you. If you have no store, van or site, ask the office to set Assigned Warehouse on your user.') + '</div>',
			'<button class="ch-secondary" data-retry="1">' + ch_icon('arrow-clockwise') + __('Try again') + '</button>'
		].join('\n'));
		this.$root.find('[data-retry]').on('click', () => this.load().then(() => this.home(), () => this.no_entry()));
	}

	on_show() {
		if (this.ctx && this.screen === 'home') this.refresh_inbox();
	}

	// van-site-stock/send-van, /deliver, /return-store, /return-van, /used, /stock, /find,
	// /recent opens that screen (home tiles link here).
	open_route() {
		this.go((frappe.get_route() || [])[1] || 'home');
	}

	go(where) {
		if (where === 'send-van') this.send('to-van');
		else if (where === 'deliver') this.send('to-site');
		else if (where === 'return-store') this.send('to-store');
		else if (where === 'return-van') this.send('site-to-van');
		else if (where === 'used') this.use();
		else if (where === 'stock') this.my_stock();
		else if (where === 'find') this.find();
		else if (where === 'recent') this.recent();
		else if (where === 'po-request' || where === 'po-approvals') window.location.href = '/' + where;
		else this.home();
	}

	// ---- building blocks ---------------------------------------------------

	render(html, screen) {
		this.screen = screen || null;
		this.$root.html(html);
		window.scrollTo(0, 0);
	}

	head(title, sub, back) {
		return [
			'<div class="ch-head">',
			back ? '  <button class="ch-back" data-back="1" aria-label="' + __('Back') + '">' + ch_icon('arrow-left') + '</button>' : '',
			'  <div class="ch-head-text">',
			'    <div class="ch-title">' + ch_esc(title) + '</div>',
			sub ? '    <div class="ch-sub">' + ch_esc(sub) + '</div>' : '',
			'  </div>',
			'</div>'
		].join('\n');
	}

	bind_back(handler) {
		this.$root.find('[data-back]').on('click', handler);
	}

	can_camera() {
		return !!(frappe.ui && frappe.ui.Scanner);
	}

	scan_box(placeholder) {
		return [
			'<div class="ch-scan">',
			'  <span class="ch-scan-mark">' + ch_icon('barcode') + '</span>',
			'  <input class="ch-input" data-scan="1" placeholder="' + ch_esc(placeholder) + '"',
			'         autocomplete="off" spellcheck="false" enterkeyhint="go">',
			this.can_camera() ? '  <button class="ch-camera" data-camera="1" aria-label="' + __('Scan with the camera') + '">' + ch_icon('camera') + '</button>' : '',
			'</div>'
		].join('\n');
	}

	// Hardware scanners type the code and press Enter; so do people. The camera feeds the
	// same handler. on_input, where given, filters a list as people type.
	bind_scan(handler, on_input) {
		var $scan = this.$root.find('[data-scan]');
		$scan.on('keydown', function(e) {
			if (e.key !== 'Enter') return;
			e.preventDefault();
			var term = ($scan.val() || '').trim();
			$scan.val('');
			if (on_input) on_input('');
			if (term) handler(term);
		});
		if (on_input) $scan.on('input', function() { on_input(($scan.val() || '').trim()); });
		this.$root.find('[data-camera]').on('click', () => this.camera(handler));
		// Not on phones: the keyboard would cover the screen before anything is scanned.
		if (!frappe.is_mobile()) $scan.trigger('focus');
	}

	camera(handler) {
		new frappe.ui.Scanner({
			dialog: true,
			multiple: false,
			on_scan: function(data) {
				var text = data && (data.decodedText || (data.result && data.result.text));
				if (text) handler(String(text).trim());
			}
		});
	}

	focus_scan() {
		if (!frappe.is_mobile()) this.$root.find('[data-scan]').val('').trigger('focus');
	}

	say(message, tone) {
		frappe.show_alert({ message: ch_esc(message), indicator: tone || 'orange' }, 5);
	}

	tile(go, icon, title, blurb) {
		return [
			'<button class="ch-tile" data-go="' + go + '">',
			'  <span class="ch-tile-mark">' + ch_icon(icon) + '</span>',
			'  <span class="ch-tile-text">',
			'    <span class="ch-tile-title">' + ch_esc(title) + '</span>',
			'    <span class="ch-tile-sub">' + ch_esc(blurb) + '</span>',
			'  </span>',
			'  <span class="ch-tile-go">' + ch_icon('arrow-right') + '</span>',
			'</button>'
		].join('\n');
	}

	row(attrs, main, sub, right) {
		return [
			'<button class="ch-row" ' + attrs + '>',
			'  <span class="ch-row-main">' + main + '</span>',
			sub ? '  <span class="ch-row-sub">' + sub + '</span>' : '',
			right ? '  <span class="ch-row-right">' + right + '</span>' : '',
			'</button>'
		].join('\n');
	}

	tag(text, tone) {
		return '<span class="ch-tag' + (tone ? ' ch-tag-' + tone : '') + '">' + ch_esc(text) + '</span>';
	}

	// A place picker: fixed text when there is only one, a select otherwise.
	place_field(side, label, list, selected, choose_text) {
		var body;
		if (list.length === 1) {
			body = '<div class="ch-fixed">' + ch_icon('map-pin') + ch_esc(list[0].label) + '</div>';
		} else {
			body = [
				'<select class="ch-select" data-side="' + side + '">',
				selected ? '' : '<option value="">' + ch_esc(choose_text) + '</option>',
				list.map(function(p) {
					return '<option value="' + ch_esc(p.name) + '"' + (p.name === selected ? ' selected' : '') + '>' + ch_esc(p.label + (p.driver ? ' · ' + p.driver : '')) + '</option>';
				}).join('\n'),
				'</select>'
			].join('\n');
		}
		return '<label class="ch-label">' + ch_esc(label) + body + '</label>';
	}

	// How many, and from or into where: one dialog. opts: default, max (number or
	// function of the dialog values), max_text, info, label, action, allow_zero,
	// take / put ([{value, label}]) with take_default / put_default.
	ask(item, opts, done) {
		var me = this;
		opts = opts || {};
		var fields = [
			{ fieldtype: 'HTML', fieldname: 'info' },
			{ fieldtype: 'Float', fieldname: 'qty', label: opts.label || __('How many?'), reqd: 1, default: opts.default != null ? opts.default : 1 }
		];
		if (opts.take) fields.push({ fieldtype: 'Select', fieldname: 'take', label: __('Take from'), reqd: 1, options: opts.take, default: opts.take_default });
		if (opts.put) fields.push({ fieldtype: 'Select', fieldname: 'put', label: __('Put in'), reqd: 1, options: opts.put, default: opts.put_default });
		var d = new frappe.ui.Dialog({
			title: item.item_code,
			fields: fields,
			primary_action_label: opts.action || __('Add'),
			primary_action: function(values) {
				var qty = flt(values.qty);
				if (qty < 0 || (qty === 0 && !opts.allow_zero)) { me.say(__('Enter a quantity above zero.'), 'red'); return; }
				var max = typeof opts.max === 'function' ? opts.max(values) : opts.max;
				if (max != null && qty > flt(max) + 1e-9) {
					me.say(typeof opts.max_text === 'function' ? opts.max_text(values) : (opts.max_text || __('Only {0} available.', [ch_qty(max)])), 'red');
					return;
				}
				d.hide();
				done(qty, values);
			}
		});
		d.fields_dict.info.$wrapper.html([
			'<div class="ch-ask">',
			'  <div class="ch-ask-name">' + ch_esc(item.item_name || item.item_code) + '</div>',
			opts.info ? '  <div class="ch-ask-info">' + opts.info + '</div>' : '',
			'</div>'
		].join('\n'));
		d.on_hide = function() { me.focus_scan(); };
		d.show();
		setTimeout(function() { d.get_field('qty').$input.trigger('focus').trigger('select'); }, 250);
	}

	done(message, ref, actions) {
		this.render([
			'<div class="ch-done">',
			'  <span class="ch-tick">' + ch_icon('check') + '</span>',
			'  <div class="ch-done-msg">' + ch_esc(message) + '</div>',
			ref ? '  <div class="ch-done-ref">' + ch_esc(ref) + '</div>' : '',
			'</div>',
			'<div class="ch-stack">',
			actions.map(function(a, i) {
				return '<button class="' + (a.primary ? 'ch-submit' : 'ch-secondary') + '" data-action="' + i + '">' + ch_esc(a.label) + '</button>';
			}).join('\n'),
			'</div>'
		].join('\n'), 'done');
		this.$root.find('[data-action]').on('click', function() { actions[+$(this).attr('data-action')].fn(); });
		// What just happened changes what is waiting; home shows it fresh.
		this.refresh_inbox();
	}

	place(name) {
		var ctx = this.ctx;
		return [].concat(ctx.mine, ctx.stores, ctx.vans, ctx.sites).filter(function(p) { return p.name === name; })[0];
	}

	// "VAN1 · Assets" -> "Assets": inside your own van the van's name is noise.
	compartment(warehouse) {
		var found = '';
		[].concat(this.ctx.vans, this.ctx.mine).forEach(function(v) {
			Object.keys(v.compartments || {}).forEach(function(cat) {
				if (v.compartments[cat] === warehouse) found = cat;
			});
		});
		return found;
	}

	// ---- home --------------------------------------------------------------

	home() {
		var ctx = this.ctx;
		var kind = ctx.kind;
		var here = ctx.mine.length === 1 ? ctx.mine[0].label : __('Your {0} sites', [ctx.mine.length]);
		var role = { store: __('Main store'), van: __('Van'), site: __('Site') }[kind];
		var mark = { store: 'warehouse', van: 'van', site: 'hard-hat' }[kind];

		var tiles = [];
		if (kind === 'store') {
			tiles.push(this.tile('send-van', 'truck', __('Send to a van'), __('Load a van from the store')));
			tiles.push(this.tile('stock', 'package', __('In the store'), __('What is on the shelves')));
		} else if (kind === 'van') {
			tiles.push(this.tile('deliver', 'map-pin', __('Deliver to a site'), __('Hand stock over at a site')));
			tiles.push(this.tile('used', 'wrench', __('Used on site'), __('Record what was fitted; it costs the job')));
			tiles.push(this.tile('return-store', 'arrow-u-down-left', __('Back to the store'), __('Return what is not needed')));
			tiles.push(this.tile('stock', 'package', __('My van'), __('What is in each part of the van')));
		} else {
			tiles.push(this.tile('used', 'wrench', __('Used on site'), __('Record what was fitted; it costs the job')));
			tiles.push(this.tile('return-van', 'truck', __('Back on a van'), __('Send stock off site')));
			tiles.push(this.tile('stock', 'package', __('On site now'), __('What is in the site store')));
		}
		tiles.push(this.tile('find', 'magnifying-glass', __('Find stock'), __('How much is there, and where')));

		this.render([
			'<div class="ch-hero">',
			'  <span class="ch-hero-mark">' + ch_icon(mark) + '</span>',
			'  <div class="ch-hero-text">',
			'    <div class="ch-hero-title">' + ch_esc(here) + '</div>',
			'    <div class="ch-hero-sub">' + ch_esc(ctx.full_name) + ' · ' + ch_esc(role) + '</div>',
			'  </div>',
			'</div>',
			'<div data-incoming></div>',
			this.scan_box(__('Scan or type an item to find it')),
			'<div data-results></div>',
			'<div class="ch-menu">' + tiles.join('\n') + '</div>',
			'<div data-sent></div>',
			'<div class="ch-links">',
			'  <button class="ch-link" data-go="recent">' + ch_icon('clock-counter-clockwise') + __('Recent') + '</button>',
			ctx.purchasing ? '  <button class="ch-link" data-go="po-request">' + ch_icon('shopping-cart') + __('Raise a PO') + '</button>' : '',
			ctx.purchasing ? '  <button class="ch-link" data-go="po-approvals">' + ch_icon('seal-check') + __('PO approvals') + '</button>' : '',
			'</div>'
		].join('\n'), 'home');

		this.$root.find('[data-go]').on('click', (e) => this.go($(e.currentTarget).attr('data-go')));
		this.bind_scan((term) => this.home_scan(term));
		this.paint_inbox();
		this.refresh_inbox();
	}

	refresh_inbox() {
		ch_call('inbox').then((inbox) => {
			this.ctx.inbox = inbox;
			if (this.screen === 'home') this.paint_inbox();
		});
	}

	paint_inbox() {
		var inbox = this.ctx.inbox || { incoming: [], sent: [] };
		var several = this.ctx.mine.length > 1;
		var $in = this.$root.find('[data-incoming]');
		var $sent = this.$root.find('[data-sent]');

		$in.html(inbox.incoming.length ? [
			'<div class="ch-waiting">',
			'  <div class="ch-waiting-head">' + ch_icon('hand-arrow-down') + ch_esc(inbox.incoming.length === 1 ? __('1 handover to accept') : __('{0} handovers to accept', [inbox.incoming.length])) + '</div>',
			'  <div class="ch-list">',
			inbox.incoming.map((d) => this.row(
				'data-docket="' + ch_esc(d.name) + '"',
				ch_esc(__('From {0}', [d.from])) + (several ? ' <span class="ch-dim">' + ch_esc(__('to {0}', [d.to])) + '</span>' : ''),
				ch_esc(d.preview) + ' · ' + ch_esc(d.by) + ' · ' + ch_esc(ch_when(d.at)),
				this.tag(__('Count'), 'go')
			)).join('\n'),
			'  </div>',
			'</div>'
		].join('\n') : '');

		$sent.html(inbox.sent.length ? [
			'<div class="ch-section">' + __('Sent, not accepted yet') + '</div>',
			'<div class="ch-list">',
			inbox.sent.map((d) => this.row(
				'data-docket="' + ch_esc(d.name) + '"',
				ch_esc(__('To {0}', [d.to])),
				ch_esc(d.preview) + ' · ' + ch_esc(ch_when(d.at)),
				this.tag(__('Waiting'))
			)).join('\n'),
			'</div>'
		].join('\n') : '');

		this.$root.find('[data-docket]').on('click', (e) => this.review($(e.currentTarget).attr('data-docket')));
	}

	home_scan(term) {
		ch_call('resolve_scan', { term: term }).then((hit) => {
			if (hit.type === 'item') this.find(hit.value);
			else this.suggest(hit, (item) => this.find(item.item_code));
		});
	}

	// Nothing matched exactly: say so, and offer close matches one tap away.
	suggest(hit, pick) {
		var items = hit.suggestions || [];
		var $results = this.$root.find('[data-results]');
		if (!items.length) {
			$results.html('<div class="ch-note">' + ch_esc(hit.label) + '</div>');
			return;
		}
		$results.html([
			'<div class="ch-note">' + ch_esc(hit.label) + ' ' + __('Did you mean:') + '</div>',
			'<div class="ch-list">',
			items.map((it, i) => this.row('data-sitem="' + i + '"', ch_esc(it.item_code), ch_esc(it.item_name), '')).join('\n'),
			'</div>'
		].join('\n'));
		$results.find('[data-sitem]').on('click', function() {
			$results.empty();
			pick(items[+$(this).attr('data-sitem')]);
		});
	}

	// ---- sending -----------------------------------------------------------

	send(kind) {
		var how = CH_SENDS[kind];
		var ctx = this.ctx;
		this.kind = kind;
		this.basket = [];
		this.docket_id = frappe.utils.get_random(20);
		this.project = '';

		var mine_names = ctx.mine.map(function(p) { return p.name; });
		var kept_from = ch_remembered(kind + ':from');
		this.from = mine_names.indexOf(kept_from) !== -1 ? kept_from : mine_names[0];

		var targets = this.targets(how);
		var kept_to = ch_remembered(kind + ':to');
		this.to = targets.some(function(p) { return p.name === kept_to; }) ? kept_to : (targets.length === 1 ? targets[0].name : '');

		this.paint_send(how);
	}

	targets(how) {
		var from = this.place(this.from);
		var company = from && from.company;
		return (this.ctx[how.to] || []).filter((p) => p.name !== this.from && (!company || !p.company || p.company === company));
	}

	paint_send(how) {
		var ctx = this.ctx;
		var source = this.place(this.from);
		var targets = this.targets(how);
		var projects = how.project ? (ctx.projects || []) : [];

		this.render([
			this.head(how.title, source ? __('From {0}', [source.label]) : '', true),
			'<div class="ch-pair">',
			this.place_field('from', __('From'), ctx.mine, this.from, __('Choose where from')),
			this.place_field('to', __('To'), targets, this.to, __('Choose where to')),
			projects.length ? [
				'<label class="ch-label">' + __('For a project? (optional)'),
				'  <select class="ch-select" data-project="1">',
				'    <option value="">' + __('No: van stock') + '</option>',
				projects.map((p) => '<option value="' + ch_esc(p.name) + '"' + (p.name === this.project ? ' selected' : '') + '>' + ch_esc(p.project_name || p.name) + '</option>').join('\n'),
				'  </select>',
				'</label>'
			].join('\n') : '',
			'</div>',
			'<div data-route-note></div>',
			this.scan_box(__('Scan or type an item')),
			'<div data-results></div>',
			'<div data-held></div>',
			'<div class="ch-section">' + __('Going') + '</div>',
			'<div class="ch-list" data-basket></div>',
			'<label class="ch-label">' + __('Note (optional)') + '<input class="ch-text" data-note="1" autocomplete="off"></label>',
			'<div class="ch-actions"><button class="ch-submit" data-record="1">' + ch_icon('paper-plane-tilt') + '<span data-record-label></span></button></div>'
		].join('\n'), 'send');

		this.bind_back(() => this.home());
		this.$root.find('[data-side]').on('change', (e) => {
			var side = $(e.currentTarget).attr('data-side');
			this[side] = $(e.currentTarget).val();
			ch_remember(this.kind + ':' + side, this[side]);
			if (side === 'from') {
				// Different shelves: start the list again.
				this.basket = [];
				if (!this.targets(how).some((p) => p.name === this.to)) this.to = '';
				this.paint_send(how);
				return;
			}
			this.paint_route_note(how);
		});
		this.$root.find('[data-project]').on('change', (e) => {
			this.project = $(e.currentTarget).val();
			this.paint_route_note(how);
			this.paint_basket();
		});

		var filter = '';
		if (how.out_of_van || source.kind === 'site') this.paint_held(this.from, how, () => filter);
		this.bind_scan((term) => this.send_scan(term, how), (typed) => {
			filter = typed;
			this.filter_held(typed);
		});
		this.$root.find('[data-record]').on('click', () => this.record_send(how));
		this.paint_route_note(how);
		this.paint_basket(__('Send {0}'));
	}

	paint_route_note(how) {
		var target = this.place(this.to);
		var note = '';
		if (how.into_van && target) {
			note = this.project
				? __('Project stock: everything goes into {0} · Goods In Transit.', [target.label])
				: __('Choose which part of {0} each item goes in.', [target.label]);
		}
		this.$root.find('[data-route-note]').html(note ? '<div class="ch-hint">' + ch_icon('info') + ch_esc(note) + '</div>' : '');
	}

	// What is at the source now: tap a line to send it.
	paint_held(location, how, filter) {
		var $box = this.$root.find('[data-held]');
		$box.html('<div class="ch-note">' + __('Loading what is here...') + '</div>');
		ch_call('held', { location: location }).then((rows) => {
			this.held_rows = rows || [];
			if (!this.held_rows.length) {
				$box.html('<div class="ch-note">' + __('Nothing here at the moment.') + '</div>');
				return;
			}
			var in_van = how && how.out_of_van;
			$box.html([
				'<div class="ch-section">' + __('Here now (tap to add)') + '</div>',
				'<div class="ch-list">',
				this.held_rows.map((r, i) => {
					// The compartment first: on a phone the end of the line is cut off.
					var sub = (in_van ? ch_esc(this.compartment(r.warehouse)) + ' · ' : '') + ch_esc(r.item_name);
					var right = ch_qty(r.free) + ' ' + ch_esc(r.stock_uom || '') + (r.free < r.qty ? '<br><span class="ch-dim">' + __('{0} on its way', [ch_qty(r.qty - r.free)]) + '</span>' : '');
					return this.row('data-held-row="' + i + '" data-filter="' + ch_esc((r.item_code + ' ' + r.item_name).toLowerCase()) + '"', ch_esc(r.item_code), sub, right);
				}).join('\n'),
				'</div>'
			].join('\n'));
			$box.find('[data-held-row]').on('click', (e) => {
				var r = this.held_rows[+$(e.currentTarget).attr('data-held-row')];
				if (how) this.add_line(r, { s_warehouse: r.warehouse }, how);
				else this.add_used(r);
			});
			if (filter && filter()) this.filter_held(filter());
		});
	}

	filter_held(typed) {
		var f = (typed || '').toLowerCase();
		this.$root.find('[data-held-row]').each(function() {
			$(this).toggle(!f || ($(this).attr('data-filter') || '').indexOf(f) !== -1);
		});
	}

	send_scan(term, how) {
		ch_call('resolve_scan', { term: term, location: this.from }).then((hit) => {
			if (hit.type === 'item') this.add_line(hit.item, {}, how);
			else this.suggest(hit, (item) => this.add_line(item, {}, how));
		});
	}

	// Free to send from one warehouse, less what is already on the list.
	free_in(item_code, warehouse, held) {
		var free = 0;
		(held || []).forEach(function(r) { if (r.item_code === item_code && r.warehouse === warehouse) free += flt(r.free); });
		this.basket.forEach(function(b) { if (b.item_code === item_code && b.s_warehouse === warehouse) free -= flt(b.qty); });
		return Math.max(free, 0);
	}

	add_line(item, known, how) {
		this.$root.find('[data-results]').empty();
		if (item.tracked) {
			this.say(__('{0} is tracked by serial or batch number. Move it from the desk.', [item.item_code]), 'red');
			return;
		}
		var held = item.held || (this.held_rows || []).filter(function(r) { return r.item_code === item.item_code; });
		var uom = item.stock_uom || '';

		// Leaving a van: which compartment. Anywhere else: the place itself.
		var sources = how.out_of_van
			? CH_COMPARTMENTS.map((cat) => {
				var wh = (this.place(this.from).compartments || {})[cat];
				return wh ? { value: wh, cat: cat, free: this.free_in(item.item_code, wh, held) } : null;
			}).filter(function(s) { return s && s.free > 0; })
			: [{ value: this.from, free: this.free_in(item.item_code, this.from, held) }].filter(function(s) { return s.free > 0; });
		if (known.s_warehouse) sources = sources.filter(function(s) { return s.value === known.s_warehouse; });
		if (!sources.length) {
			this.say(__('None of {0} free to send from here.', [item.item_code]), 'red');
			return;
		}

		var ask = (category) => {
			var free_of = function(values) {
				var pick = values && values.take ? values.take : sources[0].value;
				return (sources.filter(function(s) { return s.value === pick; })[0] || sources[0]).free;
			};
			this.ask(item, {
				default: Math.min(1, sources[0].free) || sources[0].free,
				max: free_of,
				max_text: function(values) { return __('Only {0} {1} free there.', [ch_qty(free_of(values)), uom]); },
				info: ch_esc(sources.length === 1 ? __('{0} {1} free to send.', [ch_qty(sources[0].free), uom]) : __('In more than one part of the van.')),
				take: sources.length > 1 ? sources.map(function(s) { return { value: s.value, label: s.cat + ' · ' + ch_qty(s.free) + ' ' + uom }; }) : null,
				take_default: sources[0].value,
				put: category ? this.ctx.pickable.map(function(c) { return { value: c, label: c }; }) : null,
				put_default: category
			}, (qty, values) => {
				var s_warehouse = values.take || sources[0].value;
				var t_category = values.put || '';
				var already = this.basket.filter(function(b) { return b.item_code === item.item_code && b.s_warehouse === s_warehouse && b.t_category === t_category; })[0];
				if (already) already.qty += qty;
				else this.basket.push({ item_code: item.item_code, item_name: item.item_name, stock_uom: uom, qty: qty, s_warehouse: s_warehouse, t_category: t_category });
				this.paint_basket();
			});
		};

		// Into a van without a project: which compartment, defaulting to where it went last time.
		if (how.into_van && !this.project) ch_call('last_compartment', { item_code: item.item_code }).then(ask);
		else ask(null);
	}

	paint_basket(label) {
		if (label) this.record_label = label;
		var $basket = this.$root.find('[data-basket]');
		var project = this.project;
		if (!this.basket.length) {
			$basket.html('<div class="ch-note">' + __('Nothing added yet. Scan an item, or tap one above.') + '</div>');
		} else {
			$basket.html(this.basket.map((r, i) => {
				var where = [];
				var cat = this.compartment(r.s_warehouse);
				if (cat) where.push(__('from {0}', [cat]));
				if (this.kind && CH_SENDS[this.kind] && CH_SENDS[this.kind].into_van) where.push(__('into {0}', [project ? 'Goods In Transit' : (r.t_category || 'Van Stock')]));
				return [
					'<div class="ch-row ch-row-static">',
					'  <span class="ch-row-main">' + ch_esc(r.item_code) + '</span>',
					'  <span class="ch-row-sub">' + ch_esc([r.item_name].concat(where).filter(Boolean).join(' · ')) + '</span>',
					'  <span class="ch-row-right">' + ch_qty(r.qty) + ' ' + ch_esc(r.stock_uom || '') + '</span>',
					'  <button class="ch-remove" data-remove="' + i + '" aria-label="' + __('Remove') + '">' + ch_icon('x') + '</button>',
					'</div>'
				].join('\n');
			}).join('\n'));
			$basket.find('[data-remove]').on('click', (e) => {
				this.basket.splice(+$(e.currentTarget).attr('data-remove'), 1);
				this.paint_basket();
			});
		}
		var n = this.basket.length;
		this.$root.find('[data-record]').prop('disabled', !n);
		this.$root.find('[data-record-label]').text(n ? (this.record_label || '{0}').replace('{0}', ch_lines(n)) : __('Add items first'));
	}

	record_send(how) {
		if (!this.from || !this.to) { this.say(__('Choose where the goods come from and where they go.'), 'red'); return; }
		var target = this.place(this.to);
		ch_call('send', {
			from_location: this.from,
			to_location: this.to,
			project: this.project || '',
			notes: this.$root.find('[data-note]').val() || '',
			docket_id: this.docket_id,
			rows: JSON.stringify(this.basket.map(function(r) {
				return { item_code: r.item_code, qty: r.qty, s_warehouse: r.s_warehouse, t_category: r.t_category };
			}))
		}, true).then((r) => {
			var kind = this.kind;
			this.done(__('Sent to {0}', [target.label]), r.name + ' · ' + __('nothing moves until they count it and accept'), [
				{ label: __('Send more'), primary: true, fn: () => this.send(kind) },
				{ label: __('Home'), fn: () => this.home() }
			]);
		});
	}

	// ---- one handover: count and accept, turn down, or withdraw ---------------

	review(name) {
		ch_call('docket', { name: name }).then((d) => {
			this.counted = {};
			d.lines.forEach((l) => { this.counted[l.row] = l.sent; });
			this.paint_review(d);
		});
	}

	paint_review(d) {
		var facts = [
			[__('From'), d.from],
			[__('To'), d.to],
			d.project ? [__('Project'), d.project_name || d.project] : null,
			[__('Sent by'), d.by + ' · ' + ch_when(d.at)],
			d.received_by ? [__('Accepted by'), d.received_by + ' · ' + ch_when(d.received_at)] : null,
			d.stock_entry ? [__('Stock entry'), d.stock_entry] : null
		].filter(Boolean);
		var status = d.status === 'Open' ? null : (d.status === 'Posted' ? this.tag(__('Accepted'), 'good') : this.tag(__('Cancelled'), 'warn'));
		var title = d.can_accept ? __('From {0}', [d.from]) : __('To {0}', [d.to]);

		this.render([
			this.head(title, d.name, true),
			'<div class="ch-card">',
			status ? '<div class="ch-card-status">' + status + '</div>' : '',
			facts.map(function(f) { return '<div class="ch-fact"><span>' + ch_esc(f[0]) + '</span><b>' + ch_esc(f[1]) + '</b></div>'; }).join('\n'),
			d.notes ? '<div class="ch-notes">' + ch_esc(d.notes).replace(/\n/g, '<br>') + '</div>' : '',
			'</div>',
			'<div class="ch-section">' + (d.can_accept ? __('Count what arrived (tap a line to change it)') : __('What was sent')) + '</div>',
			'<div class="ch-list" data-lines></div>',
			d.can_accept ? '<label class="ch-label">' + __('Note (optional)') + '<input class="ch-text" data-note="1" autocomplete="off"></label>' : '',
			d.can_accept ? '<button class="ch-secondary ch-quiet" data-reject="1">' + ch_icon('prohibit') + __('Turn it down') + '</button>' : '',
			d.can_withdraw ? '<button class="ch-secondary" data-withdraw="1">' + ch_icon('arrow-bend-up-left') + __('Withdraw it') + '</button>' : '',
			d.can_accept ? '<div class="ch-actions"><button class="ch-submit" data-accept="1">' + ch_icon('check') + '<span data-accept-label></span></button></div>' : ''
		].join('\n'), 'review');

		this.bind_back(() => this.home());
		this.paint_lines(d);
		this.$root.find('[data-accept]').on('click', () => this.accept(d));
		this.$root.find('[data-reject]').on('click', () => this.reject(d));
		this.$root.find('[data-withdraw]').on('click', () => this.withdraw(d));
	}

	paint_lines(d) {
		var counted = this.counted;
		var $lines = this.$root.find('[data-lines]');
		$lines.html(d.lines.map((l) => {
			// Only a van's compartments are worth saying per line; the rest is on the card.
			var where = [];
			if (this.is_compartment(l.from)) where.push(__('from {0}', [this.compartment_of(l.from)]));
			if (this.is_compartment(l.to)) where.push(__('into {0}', [this.compartment_of(l.to)]));
			var sub = ch_esc(where.concat([l.item_name]).filter(Boolean).join(' · '));
			var right;
			if (d.can_accept) {
				var n = flt(counted[l.row]);
				right = n === flt(l.sent)
					? this.tag(__('All {0}', [ch_qty(l.sent) + ' ' + (l.uom || '')]), 'good')
					: this.tag(__('{0} of {1}', [ch_qty(n), ch_qty(l.sent)]), 'warn');
			} else if (d.status === 'Posted') {
				right = flt(l.received) === flt(l.sent) ? ch_qty(l.sent) + ' ' + ch_esc(l.uom || '') : this.tag(__('{0} of {1}', [ch_qty(l.received), ch_qty(l.sent)]), 'warn');
			} else {
				right = ch_qty(l.sent) + ' ' + ch_esc(l.uom || '');
			}
			return this.row((d.can_accept ? '' : 'disabled ') + 'data-line="' + ch_esc(l.row) + '"', ch_esc(l.item_code), sub, right);
		}).join('\n'));
		if (d.can_accept) {
			$lines.find('[data-line]').on('click', (e) => {
				var l = d.lines.filter(function(x) { return x.row === $(e.currentTarget).attr('data-line'); })[0];
				this.ask(l, {
					label: __('How many arrived?'),
					default: counted[l.row],
					max: l.sent,
					max_text: __('Only {0} was sent. Ask for the extra to be sent on its own.', [ch_qty(l.sent)]),
					info: ch_esc(__('{0} {1} sent.', [ch_qty(l.sent), l.uom || ''])),
					allow_zero: true,
					action: __('Set')
				}, (qty) => {
					counted[l.row] = qty;
					this.paint_lines(d);
				});
			});
			var short = d.lines.filter(function(l) { return flt(counted[l.row]) < flt(l.sent); }).length;
			var arrived = d.lines.filter(function(l) { return flt(counted[l.row]) > 0; }).length;
			this.$root.find('[data-accept]').prop('disabled', !arrived);
			this.$root.find('[data-accept-label]').text(!arrived
				? __('Nothing counted in')
				: (short ? __('Accept, {0} short', [short === 1 ? __('1 line') : __('{0} lines', [short])]) : __('Accept {0}', [ch_lines(d.lines.length)])));
		}
	}

	// Line labels come from the server as "VAN1 · Assets" for a van's compartment.
	is_compartment(label) {
		return String(label || '').indexOf(' · ') !== -1;
	}

	compartment_of(label) {
		var parts = String(label || '').split(' · ');
		return parts[parts.length - 1];
	}

	accept(d) {
		ch_call('accept', {
			name: d.name,
			counted: JSON.stringify(this.counted),
			notes: this.$root.find('[data-note]').val() || ''
		}, true).then((r) => {
			this.done(__('Accepted into {0}', [d.to]), r.stock_entry + ' · ' + d.name, [
				{ label: __('Home'), primary: true, fn: () => this.home() }
			]);
		});
	}

	reject(d) {
		var dialog = new frappe.ui.Dialog({
			title: __('Turn it down'),
			fields: [{ fieldtype: 'Small Text', fieldname: 'reason', label: __('Why? {0} will see this.', [d.by]), reqd: 1 }],
			primary_action_label: __('Turn it down'),
			primary_action: (values) => {
				dialog.hide();
				ch_call('reject', { name: d.name, reason: values.reason }, true).then(() => {
					this.done(__('Turned down'), d.name + ' · ' + __('nothing moved'), [
						{ label: __('Home'), primary: true, fn: () => this.home() }
					]);
				});
			}
		});
		dialog.show();
	}

	withdraw(d) {
		frappe.confirm(__('Withdraw this handover to {0}? Nothing will move.', [d.to]), () => {
			ch_call('withdraw', { name: d.name }, true).then(() => {
				this.done(__('Withdrawn'), d.name + ' · ' + __('nothing moved'), [
					{ label: __('Home'), primary: true, fn: () => this.home() }
				]);
			});
		});
	}

	// ---- used on site ------------------------------------------------------

	use() {
		var ctx = this.ctx;
		var sites = ctx.kind === 'site' ? ctx.mine : ctx.sites;
		sites = sites.filter(function(s) { return s.project; });
		if (sites.length === 1) { this.use_at(sites[0]); return; }
		this.pick_site(__('Used on site'), sites, (site) => this.use_at(site));
	}

	pick_site(title, sites, next) {
		this.render([
			this.head(title, __('Which site?'), true),
			this.scan_box(__('Type to find the site')),
			'<div class="ch-list" data-sites></div>'
		].join('\n'), 'pick');
		this.bind_back(() => this.home());

		var kept = ch_remembered('site');
		var ordered = sites.slice().sort(function(a, b) { return (b.name === kept) - (a.name === kept); });
		var paint = (filter) => {
			var f = (filter || '').toLowerCase();
			var shown = ordered.filter(function(s) { return !f || [s.label, s.project_name].some(function(v) { return String(v || '').toLowerCase().indexOf(f) !== -1; }); });
			var $list = this.$root.find('[data-sites]');
			if (!shown.length) {
				$list.html('<div class="ch-note">' + (sites.length ? __('No site matches that.') : __('No sites are on an open project.')) + '</div>');
				return;
			}
			$list.html(shown.map((s) => this.row('data-site="' + ch_esc(s.name) + '"', ch_icon('map-pin') + ' ' + ch_esc(this.site_name(s)), '', s.name === kept ? this.tag(__('Last time')) : '')).join('\n'));
			$list.find('[data-site]').on('click', function() {
				var name = $(this).attr('data-site');
				next(sites.filter(function(s) { return s.name === name; })[0]);
			});
		};
		paint('');
		this.bind_scan((term) => {
			var f = term.toLowerCase();
			var hits = sites.filter(function(s) { return String(s.label).toLowerCase().indexOf(f) !== -1; });
			if (hits.length === 1) next(hits[0]);
			else paint(term);
		}, paint);
	}

	// A site's label usually carries its project already ("BAT26 Site 1"); say it once.
	site_name(site) {
		var project = site.project_name || '';
		return project && String(site.label).indexOf(project) === -1 ? site.label + ' · ' + project : site.label;
	}

	use_at(site) {
		ch_remember('site', site.name);
		this.kind = null;
		this.basket = [];
		this.from = site.name;
		this.render([
			this.head(__('Used on site'), this.site_name(site), true),
			this.scan_box(__('Scan or type what was fitted')),
			'<div data-results></div>',
			'<div data-held></div>',
			'<div class="ch-section">' + __('Used') + '</div>',
			'<div class="ch-list" data-basket></div>',
			'<label class="ch-label">' + __('Note (optional)') + '<input class="ch-text" data-note="1" autocomplete="off"></label>',
			'<div class="ch-actions"><button class="ch-submit" data-record="1">' + ch_icon('check') + '<span data-record-label></span></button></div>'
		].join('\n'), 'use');

		this.bind_back(() => this.home());
		var filter = '';
		this.paint_held(site.name, null, () => filter);
		this.bind_scan((term) => {
			ch_call('resolve_scan', { term: term, location: site.name }).then((hit) => {
				if (hit.type === 'item') this.add_used(hit.item);
				else this.suggest(hit, (item) => this.add_used(item));
			});
		}, (typed) => {
			filter = typed;
			this.filter_held(typed);
		});
		this.$root.find('[data-record]').on('click', () => {
			ch_call('use', {
				store: site.name,
				notes: this.$root.find('[data-note]').val() || '',
				rows: JSON.stringify(this.basket.map(function(r) { return { item_code: r.item_code, qty: r.qty }; }))
			}, true).then((r) => {
				this.done(__('Used on {0}', [site.label]), r.name + ' · ' + __('costed to {0}', [site.project_name || r.project]), [
					{ label: __('More for {0}', [site.label]), primary: true, fn: () => this.use_at(site) },
					{ label: __('Home'), fn: () => this.home() }
				]);
			});
		});
		this.paint_basket(__('Record {0} used'));
	}

	add_used(item) {
		this.$root.find('[data-results]').empty();
		if (item.tracked) {
			this.say(__('{0} is tracked by serial or batch number. It is moved, not used up.', [item.item_code]), 'red');
			return;
		}
		var held = item.held || (this.held_rows || []).filter(function(r) { return r.item_code === item.item_code; });
		var free = this.free_in(item.item_code, this.from, held);
		var uom = item.stock_uom || '';
		if (free <= 0) {
			this.say(__('None of {0} at this site.', [item.item_code]), 'red');
			return;
		}
		this.ask(item, {
			default: Math.min(1, free) || free,
			max: free,
			max_text: __('Only {0} {1} at this site.', [ch_qty(free), uom]),
			info: ch_esc(__('{0} {1} at this site.', [ch_qty(free), uom]))
		}, (qty) => {
			var already = this.basket.filter(function(b) { return b.item_code === item.item_code; })[0];
			if (already) already.qty += qty;
			else this.basket.push({ item_code: item.item_code, item_name: item.item_name, stock_uom: uom, qty: qty, s_warehouse: this.from });
			this.paint_basket();
		});
	}

	// ---- what is here ------------------------------------------------------

	my_stock(location) {
		var ctx = this.ctx;
		var kept = ch_remembered('stock');
		var names = ctx.mine.map(function(p) { return p.name; });
		location = location || (names.indexOf(kept) !== -1 ? kept : names[0]);
		var here = this.place(location);
		var title = { store: __('In the store'), van: __('My van'), site: __('On site now') }[ctx.kind];

		this.render([
			this.head(title, here.label, true),
			ctx.mine.length > 1 ? '<div class="ch-pair">' + this.place_field('stock', __('Where'), ctx.mine, location, '') + '</div>' : '',
			this.scan_box(__('Type to find an item')),
			'<div data-stock><div class="ch-note">' + __('Loading...') + '</div></div>'
		].join('\n'), 'stock');
		this.bind_back(() => this.home());
		this.$root.find('[data-side]').on('change', (e) => {
			ch_remember('stock', $(e.currentTarget).val());
			this.my_stock($(e.currentTarget).val());
		});

		ch_call('held', { location: location }).then((rows) => {
			rows = rows || [];
			var $box = this.$root.find('[data-stock]');
			if (!rows.length) { $box.html('<div class="ch-note">' + __('Nothing here at the moment.') + '</div>'); return; }
			var line = (r) => {
				var right = ch_qty(r.qty) + ' ' + ch_esc(r.stock_uom || '') + (r.free < r.qty ? '<br><span class="ch-dim">' + __('{0} on its way out', [ch_qty(r.qty - r.free)]) + '</span>' : '');
				return this.row('disabled data-filter="' + ch_esc((r.item_code + ' ' + r.item_name).toLowerCase()) + '" data-held-row="1"', ch_esc(r.item_code), ch_esc(r.item_name), right);
			};
			if (here.kind === 'van') {
				$box.html(CH_COMPARTMENTS.map((cat) => {
					var wh = (here.compartments || {})[cat];
					var mine = rows.filter(function(r) { return r.warehouse === wh; });
					return '<div class="ch-section">' + ch_esc(cat) + '</div>' +
						(mine.length ? '<div class="ch-list">' + mine.map(line).join('\n') + '</div>' : '<div class="ch-note ch-note-small">' + __('Empty') + '</div>');
				}).join('\n'));
			} else {
				$box.html('<div class="ch-list">' + rows.map(line).join('\n') + '</div>');
			}
		});
		this.bind_scan((term) => this.find_from(term), (typed) => this.filter_held(typed));
	}

	// ---- find stock --------------------------------------------------------

	find(item_code) {
		this.render([
			this.head(__('Find stock'), __('Scan or type an item'), true),
			this.scan_box(__('Scan or type an item')),
			'<div data-results></div>',
			'<div data-stock></div>'
		].join('\n'), 'find');
		this.bind_back(() => this.home());
		this.bind_scan((term) => this.find_from(term));
		if (item_code) this.show_stock(item_code);
	}

	find_from(term) {
		ch_call('resolve_scan', { term: term }).then((hit) => {
			if (hit.type === 'item') {
				if (this.screen !== 'find') this.find(hit.value);
				else this.show_stock(hit.value);
			} else {
				if (this.screen !== 'find') this.find();
				this.suggest(hit, (item) => this.show_stock(item.item_code));
			}
		});
	}

	show_stock(item_code) {
		this.$root.find('[data-results]').empty();
		ch_call('stock_for', { item_code: item_code }).then((s) => {
			var uom = s.stock_uom || '';
			var rows = s.rows || [];
			this.$root.find('[data-stock]').html([
				'<div class="ch-card">',
				'  <div class="ch-card-title">' + ch_esc(s.item_name || s.item_code) + '</div>',
				'  <div class="ch-dim">' + ch_esc(s.item_code) + '</div>',
				'  <div class="ch-totals">',
				'    <div><b>' + ch_qty(s.on_hand) + '</b><span>' + ch_esc(uom) + ' ' + __('on hand') + '</span></div>',
				'    <div><b>' + ch_qty(s.on_order) + '</b><span>' + ch_esc(uom) + ' ' + __('on order') + '</span></div>',
				'  </div>',
				'</div>',
				rows.length ? '<div class="ch-section">' + __('Where it is') + '</div><div class="ch-list">' + rows.map((r) => {
					var main = ch_esc(r.where) + (r.mine ? ' ' + this.tag(__('Yours')) : '');
					return this.row('disabled', main, '', ch_qty(r.qty) + ' ' + ch_esc(uom));
				}).join('\n') + '</div>' : '<div class="ch-note">' + __('None in stock anywhere.') + '</div>'
			].join('\n'));
		});
	}

	// ---- recent ------------------------------------------------------------

	recent() {
		this.render([
			this.head(__('Recent'), __('Handovers and what was used on site'), true),
			'<div data-recent><div class="ch-note">' + __('Loading...') + '</div></div>'
		].join('\n'), 'recent');
		this.bind_back(() => this.home());
		ch_call('recent').then((r) => {
			var dockets = r.dockets || [];
			var used = r.used || [];
			this.$root.find('[data-recent]').html([
				'<div class="ch-section">' + __('Handovers') + '</div>',
				dockets.length ? '<div class="ch-list">' + dockets.map((d) => this.row(
					'data-docket="' + ch_esc(d.name) + '"',
					ch_esc(d.from) + ' ' + ch_icon('arrow-right') + ' ' + ch_esc(d.to),
					ch_esc(d.preview) + ' · ' + ch_esc(ch_when(d.at)),
					d.status === 'Posted' ? this.tag(__('Accepted'), 'good') : this.tag(__('Cancelled'), 'warn')
				)).join('\n') + '</div>' : '<div class="ch-note">' + __('No handovers yet.') + '</div>',
				'<div class="ch-section">' + __('Used on site') + '</div>',
				used.length ? '<div class="ch-list">' + used.map((u) => this.row(
					'disabled',
					ch_esc(u.where),
					ch_esc([u.name, u.by, frappe.datetime.str_to_user(u.at)].filter(Boolean).join(' · ')),
					u.value ? ch_esc(format_currency(u.value)) : ''
				)).join('\n') + '</div>' : '<div class="ch-note">' + __('Nothing recorded yet.') + '</div>'
			].join('\n'));
			this.$root.find('[data-docket]').on('click', (e) => this.review($(e.currentTarget).attr('data-docket')));
		});
	}
}
