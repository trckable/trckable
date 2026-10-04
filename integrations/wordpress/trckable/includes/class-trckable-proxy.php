<?php
/**
 * The optional first-party proxy: the script and the events travel through this
 * site, so a blocklist that knows the analytics host never sees them and the
 * visitor's address still reaches trckable.
 *
 * Exactly two routes exist, and nothing else is ever forwarded:
 *   GET  /wp-json/trckable/v1/js/<site id>      the site's script (no .js: hosts that serve that
 *                                               suffix as a file would answer 404 before WordPress runs;
 *                                               with plain permalinks it is ?rest_route=/trckable/v1/js/<site id>)
 *   POST /wp-json/trckable/v1/e                 one tracking event
 *
 * @package trckable
 */

defined( 'ABSPATH' ) || exit;

/**
 * Two fixed routes to the configured server.
 */
class Trckable_Proxy {

	const NAMESPACE_ = 'trckable/v1';

	/**
	 * What trckable itself accepts is 8 KB; anything near double is not an event.
	 */
	const MAX_BODY = 16384;

	/**
	 * The script is a few KB; this is a ceiling, not a size.
	 */
	const MAX_SCRIPT = 262144;

	/**
	 * Hooks the routes in.
	 *
	 * @return void
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'routes' ) );
		add_filter( 'rest_pre_serve_request', array( __CLASS__, 'serve_script' ), 10, 3 );
	}

	/**
	 * Registers the two routes.
	 *
	 * @return void
	 */
	public static function routes() {
		register_rest_route(
			self::NAMESPACE_,
			'/js/(?P<site>tkb_[A-Za-z0-9]+)(?:\.js)?',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'script' ),
				'permission_callback' => '__return_true', // Public on purpose: it is the tracking script.
			)
		);
		register_rest_route(
			self::NAMESPACE_,
			'/e',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'event' ),
				'permission_callback' => '__return_true', // Public on purpose: visitors send their own events.
			)
		);
	}

	/**
	 * The settings, when the proxy is on; otherwise the routes answer that they are off.
	 *
	 * @return array|WP_Error
	 */
	private static function ready() {
		$o = Trckable_Options::get();
		if ( ! Trckable_Options::proxy_ready( $o ) ) {
			return new WP_Error( 'trckable_off', __( 'The proxy is off.', 'trckable' ), array( 'status' => 404 ) );
		}
		return $o;
	}

	/**
	 * Answers the script from the server, kept for an hour (the server says the same).
	 *
	 * @param WP_REST_Request $request The request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function script( $request ) {
		$o = self::ready();
		if ( is_wp_error( $o ) ) {
			return $o;
		}
		$site = (string) $request['site'];
		if ( $site !== $o['site'] ) {
			return new WP_Error( 'trckable_site', __( 'Unknown site.', 'trckable' ), array( 'status' => 404 ) );
		}
		$host  = Trckable_Options::server_url( $o );
		$stamp = md5( $host . '|' . $site );
		$kept  = get_transient( 'trckable_script' );
		if ( is_array( $kept ) && isset( $kept['stamp'], $kept['body'] ) && $kept['stamp'] === $stamp ) {
			return new WP_REST_Response( $kept['body'], 200 );
		}
		$res = wp_remote_get(
			$host . '/js/' . rawurlencode( $site ) . '.js',
			array(
				'timeout'             => 5,
				'redirection'         => 0,
				'limit_response_size' => self::MAX_SCRIPT,
			)
		);
		$ct  = is_wp_error( $res ) ? '' : (string) wp_remote_retrieve_header( $res, 'content-type' );
		if ( is_wp_error( $res ) || 200 !== wp_remote_retrieve_response_code( $res ) || false === stripos( $ct, 'javascript' ) ) {
			return new WP_Error( 'trckable_upstream', __( 'The trckable server did not answer.', 'trckable' ), array( 'status' => 502 ) );
		}
		$body = wp_remote_retrieve_body( $res );
		set_transient( 'trckable_script', compact( 'stamp', 'body' ), HOUR_IN_SECONDS );
		return new WP_REST_Response( $body, 200 );
	}

	/**
	 * Sends a script answer as it is (JavaScript), not as JSON.
	 *
	 * @param bool             $served  Whether something already served the request.
	 * @param WP_REST_Response $result The result.
	 * @param WP_REST_Request  $request The request.
	 * @return bool
	 */
	public static function serve_script( $served, $result, $request ) {
		if ( $served || 0 !== strpos( $request->get_route(), '/' . self::NAMESPACE_ . '/js/' ) || 200 !== $result->get_status() || ! is_string( $result->get_data() ) ) {
			return $served;
		}
		header( 'Content-Type: application/javascript; charset=utf-8' );
		header( 'Cache-Control: public, max-age=3600' );
		echo $result->get_data(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- the tracking script itself, from the configured server.
		return true;
	}

	/**
	 * Forwards one event, with the visitor's address and the proxy key.
	 *
	 * @param WP_REST_Request $request The request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function event( $request ) {
		$o = self::ready();
		if ( is_wp_error( $o ) ) {
			return $o;
		}
		$body = $request->get_body();
		if ( strlen( $body ) > self::MAX_BODY ) {
			return new WP_Error( 'trckable_size', __( 'Too large.', 'trckable' ), array( 'status' => 413 ) );
		}
		$event = json_decode( $body, true );
		if ( ! is_array( $event ) || ! isset( $event['s'] ) || $event['s'] !== $o['site'] ) {
			return new WP_Error( 'trckable_event', __( 'Not an event of this site.', 'trckable' ), array( 'status' => 400 ) );
		}
		$res = wp_remote_post(
			Trckable_Options::server_url( $o ) . '/api/e',
			array(
				'timeout'     => 5,
				'redirection' => 0,
				'headers'     => self::headers( $o['proxy_key'] ),
				'body'        => $body,
			)
		);
		if ( is_wp_error( $res ) ) {
			$out = new WP_REST_Response( null, 503 ); // The tracker keeps the event and tries again.
			$out->header( 'Retry-After', '5' );
			return $out;
		}
		$out = new WP_REST_Response( null, (int) wp_remote_retrieve_response_code( $res ) );
		$ra  = wp_remote_retrieve_header( $res, 'retry-after' );
		if ( is_string( $ra ) && '' !== $ra ) {
			$out->header( 'Retry-After', (string) absint( $ra ) );
		}
		foreach ( (array) wp_remote_retrieve_header( $res, 'set-cookie' ) as $cookie ) {
			if ( is_string( $cookie ) && 0 === strpos( $cookie, 'trckable_vid=' ) ) {
				header( 'Set-Cookie: ' . str_replace( array( "\r", "\n" ), '', $cookie ), false );
			}
		}
		return $out;
	}

	/**
	 * The headers the server needs to trust the visitor's address and honour their choices.
	 *
	 * @param string $key The site's proxy key.
	 * @return array
	 */
	private static function headers( $key ) {
		$headers = array(
			'Content-Type'         => 'text/plain',
			'User-Agent'           => isset( $_SERVER['HTTP_USER_AGENT'] ) ? substr( sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ), 0, 512 ) : '',
			'X-Trckable-Proxy-Key' => $key,
		);
		$ip      = self::client_ip();
		if ( '' !== $ip ) {
			$headers['X-Trckable-Client-IP'] = $ip;
		}
		foreach ( array(
			'HTTP_DNT'     => 'DNT',
			'HTTP_SEC_GPC' => 'Sec-GPC',
		) as $server => $name ) {
			if ( isset( $_SERVER[ $server ] ) && '1' === $_SERVER[ $server ] ) {
				$headers[ $name ] = '1';
			}
		}
		return $headers;
	}

	/**
	 * The visitor's address as the platform in front of this site reports it
	 * (the same order the trckable npm proxy uses). Behind a CDN or reverse proxy
	 * that overwrites these headers they are exact; on a site reachable directly,
	 * a visitor could forge them, which only skews their own country.
	 *
	 * @return string
	 */
	private static function client_ip() {
		$ip = '';
		foreach ( array( 'HTTP_CF_CONNECTING_IP', 'HTTP_X_NF_CLIENT_CONNECTION_IP', 'HTTP_FLY_CLIENT_IP', 'HTTP_X_REAL_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR' ) as $name ) {
			if ( empty( $_SERVER[ $name ] ) ) {
				continue;
			}
			$first = trim( explode( ',', sanitize_text_field( wp_unslash( $_SERVER[ $name ] ) ) )[0] );
			if ( false !== filter_var( $first, FILTER_VALIDATE_IP ) ) {
				$ip = $first;
				break;
			}
		}
		/**
		 * Filters the visitor's address sent with an event.
		 *
		 * @param string $ip The address.
		 */
		return (string) apply_filters( 'trckable_client_ip', $ip );
	}
}
