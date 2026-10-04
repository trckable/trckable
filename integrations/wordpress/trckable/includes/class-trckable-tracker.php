<?php
/**
 * Puts the tracking script in the page head, the way the documented script tag does.
 *
 * @package trckable
 */

defined( 'ABSPATH' ) || exit;

/**
 * The script tag: defer, data-site and, when it is on, data-cookieless.
 */
class Trckable_Tracker {

	const HANDLE = 'trckable';

	/**
	 * Hooks the script in.
	 *
	 * @return void
	 */
	public static function init() {
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue' ) );
		add_filter( 'script_loader_tag', array( __CLASS__, 'attributes' ), 10, 2 );
	}

	/**
	 * Where the script comes from: the trckable server, or this site when the proxy is on.
	 *
	 * @param array $o Settings.
	 * @return string
	 */
	public static function src( $o ) {
		if ( Trckable_Options::proxy_ready( $o ) ) {
			return rest_url( Trckable_Proxy::NAMESPACE_ . '/js/' . $o['site'] . '.js' );
		}
		return Trckable_Options::server_url( $o ) . '/js/' . rawurlencode( $o['site'] ) . '.js';
	}

	/**
	 * Whether this visit is to be counted: staff, chosen roles and previews are left out.
	 *
	 * @param array $o Settings.
	 * @return bool
	 */
	public static function should_track( $o ) {
		if ( ! Trckable_Options::configured( $o ) || is_customize_preview() ) {
			return false;
		}
		$track = true;
		if ( is_user_logged_in() ) {
			if ( ! empty( $o['exclude_staff'] ) && current_user_can( 'edit_others_posts' ) ) {
				$track = false;
			}
			$roles = (array) wp_get_current_user()->roles;
			if ( array() !== array_intersect( $roles, (array) $o['exclude_roles'] ) ) {
				$track = false;
			}
		}
		/**
		 * Filters whether the current visit is counted.
		 *
		 * @param bool $track Whether to add the script.
		 */
		return (bool) apply_filters( 'trckable_should_track', $track );
	}

	/**
	 * Enqueues the script in the head. WordPress 6.3 and later defer it themselves;
	 * older versions get the attribute from the tag filter below.
	 *
	 * @return void
	 */
	public static function enqueue() {
		$o = Trckable_Options::get();
		if ( ! self::should_track( $o ) ) {
			return;
		}
		$args = version_compare( get_bloginfo( 'version' ), '6.3', '>=' )
			? array(
				'strategy'  => 'defer',
				'in_footer' => false,
			)
			: false;
		// No version: the script is cached by its own address, not by a query string.
		wp_enqueue_script( self::HANDLE, self::src( $o ), array(), null, $args ); // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion
	}

	/**
	 * Adds the attributes the script reads to its tag.
	 *
	 * @param string $tag    The tag.
	 * @param string $handle The script's handle.
	 * @return string
	 */
	public static function attributes( $tag, $handle ) {
		if ( self::HANDLE !== $handle ) {
			return $tag;
		}
		$o     = Trckable_Options::get();
		$attrs = '';
		if ( false === strpos( $tag, ' defer' ) ) {
			$attrs .= ' defer';
		}
		$attrs .= ' data-site="' . esc_attr( $o['site'] ) . '"';
		if ( ! empty( $o['cookieless'] ) ) {
			$attrs .= ' data-cookieless';
		}
		if ( Trckable_Options::proxy_ready( $o ) ) {
			$attrs .= ' data-api="' . esc_url( rest_url( Trckable_Proxy::NAMESPACE_ . '/e' ) ) . '"';
		}
		return preg_replace( '/<script\b/', '<script' . $attrs, $tag, 1 );
	}
}
