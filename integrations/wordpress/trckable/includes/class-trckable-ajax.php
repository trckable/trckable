<?php
/**
 * What the settings page asks while it is open: is the server there, is the
 * site known, has the first visit arrived. Admin only, each call checked with
 * a nonce and the capability to manage options.
 *
 * @package trckable
 */

defined( 'ABSPATH' ) || exit;

/**
 * Four actions: check, save, status and (through save) finishing the first run.
 */
class Trckable_Ajax {

	const NONCE = 'trckable_admin';

	/**
	 * Hooks the actions in.
	 *
	 * @return void
	 */
	public static function init() {
		foreach ( array( 'check', 'save', 'status' ) as $action ) {
			add_action( 'wp_ajax_trckable_' . $action, array( __CLASS__, $action ) );
		}
	}

	/**
	 * Stops anyone who is not allowed.
	 *
	 * @return void
	 */
	private static function guard() {
		check_ajax_referer( self::NONCE, 'nonce' );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( null, 403 );
		}
	}

	/**
	 * One posted value, cleaned.
	 *
	 * @param string $name The field.
	 * @return string
	 */
	private static function posted( $name ) {
		// The nonce is checked in guard(), which every action calls first.
		return isset( $_POST[ $name ] ) ? trim( sanitize_text_field( wp_unslash( $_POST[ $name ] ) ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Missing
	}

	/**
	 * Reaches the server, and asks it whether it knows the site. The question is an
	 * event that cannot be valid (it has no page), so nothing is counted: a server
	 * that knows the site says the event is bad, one that does not says the site is unknown.
	 *
	 * @return void
	 */
	public static function check() {
		self::guard();
		$o     = array_merge( Trckable_Options::get(), array( 'server' => 'own' === self::posted( 'server' ) ? 'own' : 'cloud' ) );
		$o     = array_merge( $o, array( 'host' => self::posted( 'host' ) ) );
		$host  = Trckable_Options::server_url( $o );
		$site  = self::posted( 'site' );
		$reply = array(
			'server'  => false,
			'site'    => null,
			'message' => __( 'Could not reach the server.', 'trckable' ),
		);
		if ( '' === $host ) {
			$reply['message'] = __( 'The address needs https (http works for localhost).', 'trckable' );
			wp_send_json_success( $reply );
		}
		$js = wp_remote_get(
			$host . '/js/' . ( '' === $site ? 't' : rawurlencode( $site ) ) . '.js',
			array(
				'timeout'             => 5,
				'redirection'         => 0,
				'limit_response_size' => Trckable_Proxy::MAX_SCRIPT,
			)
		);
		if ( is_wp_error( $js ) || 200 !== wp_remote_retrieve_response_code( $js ) || false === stripos( (string) wp_remote_retrieve_header( $js, 'content-type' ), 'javascript' ) ) {
			wp_send_json_success( $reply );
		}
		$reply['server']  = true;
		$reply['message'] = __( 'Server reached.', 'trckable' );
		if ( '' !== $site ) {
			$probe = wp_remote_post(
				$host . '/api/e',
				array(
					'timeout'     => 5,
					'redirection' => 0,
					'headers'     => array( 'Content-Type' => 'text/plain' ),
					'body'        => wp_json_encode(
						array(
							's' => $site,
							'k' => 'pv',
							'u' => '',
						)
					),
				)
			);
			$said  = is_wp_error( $probe ) ? '' : (string) wp_remote_retrieve_body( $probe );
			if ( false !== stripos( $said, 'unknown site' ) ) {
				$reply['site']    = false;
				$reply['message'] = __( 'Server reached, but it does not know this site ID.', 'trckable' );
			} elseif ( false !== stripos( $said, 'bad payload' ) || false !== stripos( $said, 'hostname not allowed' ) ) {
				$reply['site']    = true;
				$reply['message'] = __( 'Server reached, site found.', 'trckable' );
			}
		}
		wp_send_json_success( $reply );
	}

	/**
	 * Saves a step of the first run: the server and site, the API key, or that it is over.
	 *
	 * @return void
	 */
	public static function save() {
		self::guard();
		$step = self::posted( 'step' );
		if ( 'connect' === $step ) {
			$site = self::posted( 'site' );
			$own  = 'own' === self::posted( 'server' );
			$host = $own ? Trckable_Options::clean_host( self::posted( 'host' ) ) : '';
			if ( ! Trckable_Options::valid_site( $site ) || ( $own && '' === $host ) ) {
				wp_send_json_error( null, 400 );
			}
			Trckable_Options::change(
				array(
					'site'       => $site,
					'server'     => $own ? 'own' : 'cloud',
					'host'       => $host,
					'onboarding' => 1,
				)
			);
		} elseif ( 'api_key' === $step ) {
			$key = self::posted( 'api_key' );
			if ( '' !== $key && ! Trckable_Options::valid_key( $key ) ) {
				wp_send_json_error( null, 400 );
			}
			Trckable_Options::change( array( 'api_key' => $key ) );
		} elseif ( 'finish' === $step ) {
			Trckable_Options::change( array( 'onboarding' => 0 ) );
		} else {
			wp_send_json_error( null, 400 );
		}
		delete_transient( Trckable_Stats::KEY );
		wp_send_json_success( array( 'ok' => true ) );
	}

	/**
	 * The live numbers and where the connection stands. When the first visit has
	 * arrived, the first run is over.
	 *
	 * @return void
	 */
	public static function status() {
		self::guard();
		$o     = Trckable_Options::get();
		$stats = Trckable_Stats::get( $o, 5 );
		$state = Trckable_Stats::state( $o, $stats );
		$reply = array(
			'state' => $state,
			'label' => Trckable_Stats::label( $state ),
			'keyed' => Trckable_Options::valid_key( $o['api_key'] ),
		);
		if ( ! is_wp_error( $stats ) ) {
			list( $line, $area ) = Trckable_View::spark_paths( $stats['series'] );
			$reply              += array(
				'online' => $stats['online'],
				'today'  => $stats['today'],
				'pages'  => $stats['pages'],
				'line'   => $line,
				'area'   => $area,
			);
		}
		if ( 'live' === $state && $o['onboarding'] ) {
			Trckable_Options::change( array( 'onboarding' => 0 ) );
			$reply['first'] = true;
		}
		wp_send_json_success( $reply );
	}
}
