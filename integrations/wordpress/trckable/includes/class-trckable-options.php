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
	 * The server a new install points at.
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
			'host'          => self::DEFAULT_HOST,
			'cookieless'    => 0,
			'exclude_staff' => 1,
			'exclude_roles' => array(),
			'proxy'         => 0,
			'proxy_key'     => '',
			'api_key'       => '',
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
	 * Cleans a server address: http(s) only, no credentials, path, query or trailing slash.
	 *
	 * @param string $url What was typed.
	 * @return string The address, or an empty string when it is not one.
	 */
	public static function clean_host( $url ) {
		$parts = wp_parse_url( trim( (string) $url ) );
		if ( ! is_array( $parts ) || empty( $parts['host'] ) || ! isset( $parts['scheme'] ) ) {
			return '';
		}
		if ( ! in_array( $parts['scheme'], array( 'http', 'https' ), true ) || isset( $parts['user'] ) || isset( $parts['pass'] ) ) {
			return '';
		}
		$host = esc_url_raw( $parts['scheme'] . '://' . $parts['host'] . ( isset( $parts['port'] ) ? ':' . (int) $parts['port'] : '' ) );
		return untrailingslashit( $host );
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
		return self::valid_site( $o['site'] ) && '' !== self::clean_host( $o['host'] );
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
