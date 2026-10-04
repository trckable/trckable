<?php
/**
 * The plugin's one option, read and cleaned in one place.
 *
 * @package trckable
 */

defined( 'ABSPATH' ) || exit;

/**
 * Settings: defaults, reading, and the rules every value must pass.
 */
class Trckable_Options {

	const NAME = 'trckable_settings';

	/**
	 * The server of the "trckable Cloud" choice.
	 */
	const DEFAULT_HOST = 'https://cloud.trckable.com';

	/**
	 * Values before anything is saved.
	 *
	 * @return array
	 */
	public static function defaults() {
		return array(
			'site'          => '',
			'server'        => 'cloud',
			'host'          => '',
			'cookieless'    => 0,
			'exclude_staff' => 1,
			'exclude_roles' => array(),
			'proxy'         => 0,
			'proxy_key'     => '',
			'api_key'       => '',
			'onboarding'    => 0,
		);
	}

	/**
	 * The saved settings, with defaults for what is missing.
	 *
	 * @return array
	 */
	public static function get() {
		$saved = get_option( self::NAME, array() );
		return array_merge( self::defaults(), is_array( $saved ) ? $saved : array() );
	}

	/**
	 * Whether a site id has the shape trckable gives them ("tkb_" and letters or digits).
	 *
	 * @param string $site The id.
	 * @return bool
	 */
	public static function valid_site( $site ) {
		return is_string( $site ) && 1 === preg_match( '/^tkb_[A-Za-z0-9]{4,64}$/', $site );
	}

	/**
	 * Saves some settings and leaves the others as they are.
	 *
	 * @param array $changes Setting names and their new values.
	 * @return void
	 */
	public static function change( $changes ) {
		update_option( self::NAME, array_merge( self::get(), $changes ) );
	}

	/**
	 * Cleans the address of a server of your own: https, or http for localhost only;
	 * no credentials, path, query or trailing slash.
	 *
	 * @param string $url What was typed.
	 * @return string The address, or an empty string when it is not one.
	 */
	public static function clean_host( $url ) {
		$parts = wp_parse_url( trim( (string) $url ) );
		if ( ! is_array( $parts ) || empty( $parts['host'] ) || ! isset( $parts['scheme'] ) || isset( $parts['user'] ) || isset( $parts['pass'] ) ) {
			return '';
		}
		$host  = strtolower( $parts['host'] );
		$local = in_array( $host, array( 'localhost', '127.0.0.1', '[::1]', '::1' ), true ) || '.localhost' === substr( $host, -10 );
		if ( 'https' !== $parts['scheme'] && ! ( 'http' === $parts['scheme'] && $local ) ) {
			return '';
		}
		$clean = esc_url_raw( $parts['scheme'] . '://' . $parts['host'] . ( isset( $parts['port'] ) ? ':' . (int) $parts['port'] : '' ) );
		return untrailingslashit( $clean );
	}

	/**
	 * The server the plugin talks to: trckable Cloud, or the address of your own.
	 *
	 * @param array $o Settings.
	 * @return string The address, or an empty string while a server of your own has none.
	 */
	public static function server_url( $o ) {
		return 'own' === $o['server'] ? self::clean_host( $o['host'] ) : self::DEFAULT_HOST;
	}

	/**
	 * A short name for the server, for the status pill: "Cloud" or the host name.
	 *
	 * @param array $o Settings.
	 * @return string
	 */
	public static function server_label( $o ) {
		if ( 'own' !== $o['server'] ) {
			return __( 'Cloud', 'trckable' );
		}
		$host = wp_parse_url( self::clean_host( $o['host'] ), PHP_URL_HOST );
		return is_string( $host ) ? $host : '';
	}

	/**
	 * Whether a secret has the plain shape trckable keys have (letters, digits, "_" and "-").
	 *
	 * @param string $key The key.
	 * @return bool
	 */
	public static function valid_key( $key ) {
		return is_string( $key ) && 1 === preg_match( '/^[A-Za-z0-9_-]{8,128}$/', $key );
	}

	/**
	 * Whether the site id and server are set, so the script can be added.
	 *
	 * @param array $o Settings.
	 * @return bool
	 */
	public static function configured( $o ) {
		return self::valid_site( $o['site'] ) && '' !== self::server_url( $o );
	}

	/**
	 * Whether the first-party proxy is on and has what it needs.
	 *
	 * @param array $o Settings.
	 * @return bool
	 */
	public static function proxy_ready( $o ) {
		return ! empty( $o['proxy'] ) && self::valid_key( $o['proxy_key'] ) && self::configured( $o );
	}
}
