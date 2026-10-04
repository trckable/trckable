/* trckable settings page: small and dependency-free. Switches, chips and
   tooltips are CSS; this file does the live parts. */
( function () {
	'use strict';
	var cfg = window.trckableAdmin;
	if ( ! cfg ) {
		return;
	}
	var t = cfg.i18n;
	var $ = function ( sel, root ) {
		return ( root || document ).querySelector( sel );
	};
	var $$ = function ( sel, root ) {
		return Array.prototype.slice.call( ( root || document ).querySelectorAll( sel ) );
	};
	var SITE = /^tkb_[A-Za-z0-9]{4,64}$/;
	var KEY = /^[A-Za-z0-9_-]{8,128}$/;

	function post( action, data ) {
		var body = new URLSearchParams( Object.assign( { action: 'trckable_' + action, nonce: cfg.nonce }, data ) );
		return fetch( cfg.ajax, { method: 'POST', credentials: 'same-origin', body: body } ).then( function ( r ) {
			return r.json();
		} );
	}

	/* The server that is chosen, and the address if it is your own. */
	function server() {
		var own = $( '#trk-server-own' );
		var host = $( '#trckable_host' );
		var isOwn = !! own && own.checked;
		var h = host ? host.value.trim().replace( /\/+$/, '' ) : '';
		var local = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]|[^/]+\.localhost)(:\d+)?$/i.test( h );
		return { own: isOwn, host: h, valid: ! isOwn || /^https:\/\/[^/\s]+$/i.test( h ) || local };
	}

	/* The tag that will be added, as text. */
	function tag() {
		var siteEl = $( '#trckable_site' );
		var site = siteEl && siteEl.value.trim() ? siteEl.value.trim() : t.tagPlaceholder;
		var sv = server();
		var cookieless = $( '#trckable_cookieless' );
		var proxy = $( '#trckable_proxy' );
		var key = $( '#trckable_proxy_key' );
		var viaSite = proxy && proxy.checked && key && KEY.test( key.value.trim() );
		var base = sv.own ? ( sv.host || 'https://…' ) : cfg.cloud;
		var out = '<script data-site="' + site + '"' + ( cookieless && cookieless.checked ? ' data-cookieless' : '' );
		out += viaSite ? ' data-api="' + cfg.tag.e + '"' : '';
		return out + ' data-wp-strategy="defer" defer id="trckable-js" src="' + ( viaSite ? cfg.tag.js + site + '.js' : base + '/js/' + site + '.js' ) + '"></script>';
	}
	function paintTag() {
		var link = $( '[data-open-trckable]' );
		if ( link ) {
			var sv = server();
			link.href = sv.own ? ( sv.host || cfg.cloud ) : cfg.cloud;
		}
		var el = $( '#trk-tag' );
		if ( el ) {
			el.textContent = tag();
		}
	}

	/* Chips that follow the switches. */
	function paintChips() {
		var map = { cookieless: '#trckable_cookieless', staff: '#trckable_exclude_staff' };
		Object.keys( map ).forEach( function ( name ) {
			var chip = $( '[data-chip="' + name + '"]' );
			var box = $( map[ name ] );
			if ( chip && box ) {
				chip.textContent = box.checked ? chip.dataset.on : chip.dataset.off;
				chip.dataset.active = box.checked ? '1' : '0';
			}
		} );
	}

	/* The status pill, the numbers and the preview. */
	function paintSparks( d ) {
		$$( '.trk-spark-line' ).forEach( function ( el ) {
			el.setAttribute( 'd', d.line );
		} );
		$$( '.trk-spark-area' ).forEach( function ( el ) {
			el.setAttribute( 'd', d.area );
		} );
	}
	function paintStatus( d ) {
		var app = $( '.trk-app' );
		var pill = $( '.trk-pill' );
		if ( app ) {
			app.dataset.state = d.state;
		}
		if ( pill ) {
			pill.dataset.state = d.state;
			pill.lastChild.textContent = d.label;
		}
		if ( typeof d.online === 'number' ) {
			$$( '[data-n="online"]' ).forEach( function ( el ) {
				el.textContent = d.online.toLocaleString();
			} );
			$$( '[data-n="today"]' ).forEach( function ( el ) {
				el.textContent = d.today.toLocaleString();
			} );
			paintSparks( d );
			var list = $( '[data-pages]' );
			if ( list && d.pages ) {
				list.textContent = '';
				d.pages.forEach( function ( row ) {
					var li = document.createElement( 'li' );
					var a = document.createElement( 'span' );
					var b = document.createElement( 'b' );
					a.textContent = row.path;
					b.textContent = row.visitors.toLocaleString();
					li.appendChild( a );
					li.appendChild( b );
					list.appendChild( li );
				} );
			}
			var prev = $( '.trk-prev' );
			if ( prev ) {
				prev.dataset.real = '1';
				$( '[data-sample]' ).textContent = t.yours;
				var hint = $( '[data-hint]' );
				if ( hint ) {
					hint.hidden = true;
				}
			}
		}
	}

	/* One connection check: a ring, then a check or a cross, and the server's answer. */
	function check( row, site ) {
		var out = $( '.trk-check', row );
		var msg = $( '.trk-check-msg', out );
		var sv = server();
		function say( state, text ) {
			out.dataset.state = state;
			msg.textContent = text;
		}
		if ( ! sv.valid || ( sv.own && ! sv.host ) ) {
			say( 'bad', t.needHost );
			return Promise.resolve( false );
		}
		if ( site !== undefined && ! SITE.test( site ) ) {
			say( 'bad', site ? t.badSite : t.needSite );
			return Promise.resolve( false );
		}
		say( 'busy', t.checking );
		return post( 'check', { server: sv.own ? 'own' : 'cloud', host: sv.host, site: site || '' } ).then( function ( r ) {
			var d = r && r.data ? r.data : null;
			var ok = !! d && d.server && d.site !== false;
			say( ok ? 'ok' : 'bad', d ? d.message : t.failed );
			return ok;
		}, function () {
			say( 'bad', t.failed );
			return false;
		} );
	}

	/* Secrets: show and hide. */
	$$( '[data-reveal]' ).forEach( function ( btn ) {
		btn.addEventListener( 'click', function () {
			var input = document.getElementById( btn.dataset.reveal );
			var shown = input.type === 'text';
			input.type = shown ? 'password' : 'text';
			btn.setAttribute( 'aria-pressed', shown ? 'false' : 'true' );
			btn.setAttribute( 'aria-label', shown ? t.show : t.hide );
		} );
	} );

	/* Copy the tag. */
	$$( '[data-copy]' ).forEach( function ( btn ) {
		btn.addEventListener( 'click', function () {
			var text = document.getElementById( btn.dataset.copy ).textContent;
			var label = $( 'span', btn );
			var done = function () {
				label.textContent = t.copied;
				setTimeout( function () {
					label.textContent = t.copy;
				}, 1600 );
			};
			if ( navigator.clipboard && window.isSecureContext ) {
				navigator.clipboard.writeText( text ).then( done );
			} else {
				var ta = document.createElement( 'textarea' );
				ta.value = text;
				document.body.appendChild( ta );
				ta.select();
				document.execCommand( 'copy' );
				document.body.removeChild( ta );
				done();
			}
		} );
	} );

	/* Live preview of the switches and the tag. */
	[ '#trckable_cookieless', '#trckable_exclude_staff', '#trckable_proxy', '#trckable_proxy_key', '#trckable_site', '#trckable_host', '#trk-server-cloud', '#trk-server-own' ].forEach( function ( sel ) {
		var el = $( sel );
		if ( el ) {
			el.addEventListener( 'input', function () {
				paintChips();
				paintTag();
			} );
			el.addEventListener( 'change', function () {
				paintChips();
				paintTag();
			} );
		}
	} );

	/* Saved. */
	var toast = $( '.trk-toast' );
	if ( toast && toast.dataset.saved === '1' ) {
		toast.classList.add( 'is-in' );
		setTimeout( function () {
			toast.classList.remove( 'is-in' );
		}, 2800 );
	}

	var onboard = $( '#trk-onboard' );

	/* The settings view: a check next to the server card, and the numbers kept fresh. */
	if ( ! onboard ) {
		var row = $( '.trk-checkrow' );
		if ( row ) {
			$( '[data-check]', row ).addEventListener( 'click', function () {
				var siteEl = $( '#trckable_site' );
				check( row, siteEl && siteEl.value.trim() ? siteEl.value.trim() : undefined );
			} );
		}
		if ( cfg.keyed ) {
			setInterval( function () {
				if ( ! document.hidden ) {
					post( 'status', {} ).then( function ( r ) {
						if ( r && r.success ) {
							paintStatus( r.data );
						}
					} );
				}
			}, 30000 );
		}
		return;
	}

	/* The first run. */
	var timer = null;
	function go( n ) {
		onboard.dataset.step = String( n );
		if ( n === 3 ) {
			watch();
		}
	}
	function watch() {
		var msg = $( '[data-wait-msg]', onboard );
		if ( ! cfg.keyed ) {
			msg.textContent = t.noKey;
			return;
		}
		msg.textContent = t.waiting;
		clearInterval( timer );
		var tick = function () {
			post( 'status', {} ).then( function ( r ) {
				if ( ! r || ! r.success ) {
					return;
				}
				paintStatus( r.data );
				if ( r.data.state === 'live' ) {
					clearInterval( timer );
					onboard.dataset.done = '1';
					msg.textContent = t.first;
				}
			} );
		};
		tick();
		timer = setInterval( tick, cfg.poll );
	}
	var rows = $$( '.trk-checkrow', onboard );
	$( '[data-next]', onboard ).addEventListener( 'click', function () {
		var sv = server();
		if ( ! sv.valid || ( sv.own && ! sv.host ) ) {
			$( '.trk-check-msg', rows[ 0 ] ).textContent = t.needHost;
			$( '.trk-check', rows[ 0 ] ).dataset.state = 'bad';
			return;
		}
		go( 2 );
		$( '#trckable_site' ).focus();
	} );
	$( '[data-check]', rows[ 0 ] ).addEventListener( 'click', function () {
		check( rows[ 0 ] );
	} );
	$( '[data-check]', rows[ 1 ] ).addEventListener( 'click', function () {
		var site = $( '#trckable_site' ).value.trim();
		var sv = server();
		check( rows[ 1 ], site ).then( function ( ok ) {
			if ( ! ok ) {
				return;
			}
			post( 'save', { step: 'connect', site: site, server: sv.own ? 'own' : 'cloud', host: sv.host } ).then( function ( r ) {
				if ( r && r.success ) {
					cfg.keyed = false;
					setTimeout( function () {
						go( 3 );
					}, 700 );
					paintStatus( { state: 'waiting', label: t.waiting } );
				}
			} );
		} );
	} );
	var save = $( '[data-save-key]', onboard );
	if ( save ) {
		save.addEventListener( 'click', function () {
			var key = $( '#trckable_api_key' ).value.trim();
			var msg = $( '[data-wait-msg]', onboard );
			if ( key && ! KEY.test( key ) ) {
				msg.textContent = t.keyBad;
				return;
			}
			post( 'save', { step: 'api_key', api_key: key } ).then( function ( r ) {
				if ( r && r.success ) {
					cfg.keyed = !! key;
					watch();
					if ( key ) {
						msg.textContent = t.keySaved;
					}
				}
			} );
		} );
	}
	$$( '[data-finish]', onboard ).forEach( function ( link ) {
		link.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			post( 'save', { step: 'finish' } ).then( function () {
				window.location.href = link.href;
			} );
		} );
	} );
	if ( onboard.dataset.step === '3' ) {
		watch();
	}
	paintTag();
}() );
