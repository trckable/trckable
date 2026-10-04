<?php
/**
 * The trckable menu, the option and the rules every saved value must pass.
 *
 * @package trckable
 */

defined( 'ABSPATH' ) || exit;

/**
 * Registration and cleaning. The page itself is drawn by Trckable_Page.
 *
 * The form is saved through the Settings API: WordPress checks the nonce,
 * this class checks the capability and cleans every value.
 */
class Trckable_Settings {

	const PAGE = 'trckable';

	/**
	 * Hooks the menu and the option in.
	 *
	 * @return void
	 */
	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'register' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( TRCKABLE_FILE ), array( __CLASS__, 'links' ) );
	}

	/**
	 * The page's address.
	 *
	 * @return string
	 */
	public static function url() {
		return admin_url( 'admin.php?page=' . self::PAGE );
	}

	/**
	 * Adds the trckable menu, with the ghost as its icon.
	 *
	 * @return void
	 */
	public static function menu() {
		$hook = add_menu_page( __( 'trckable', 'trckable' ), __( 'trckable', 'trckable' ), 'manage_options', self::PAGE, array( 'Trckable_Page', 'render' ), Trckable_View::MENU_ICON, 76 );
		add_action( 'load-' . $hook, array( 'Trckable_Page', 'prepare' ) );
	}

	/**
	 * Adds a Settings link in the plugin list.
	 *
	 * @param array $links The links.
	 * @return array
	 */
	public static function links( $links ) {
		$mine = '<a href="' . esc_url( self::url() ) . '">' . esc_html__( 'Settings', 'trckable' ) . '</a>';
		return array_merge( array( $mine ), $links );
	}

	/**
	 * Registers the option.
	 *
	 * @return void
	 */
	public static function register() {
		register_setting(
			self::PAGE,
			Trckable_Options::NAME,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( __CLASS__, 'sanitize' ),
				'default'           => Trckable_Options::defaults(),
			)
		);
	}

	/**
	 * Cleans what was submitted (WordPress has already removed the slashes).
	 * Only people who manage options get here.
	 *
	 * @param mixed $in The submitted values.
	 * @return array
	 */
	public static function sanitize( $in ) {
		$old = Trckable_Options::get();
		if ( ! current_user_can( 'manage_options' ) || ! is_array( $in ) ) {
			return $old;
		}
		$out = Trckable_Options::defaults();

		$site = isset( $in['site'] ) ? trim( sanitize_text_field( $in['site'] ) ) : '';
		if ( '' === $site || Trckable_Options::valid_site( $site ) ) {
			$out['site'] = $site;
		} else {
			$out['site'] = $old['site'];
			add_settings_error( self::PAGE, 'trckable_site', __( 'The site ID looks like tkb_ followed by letters and digits.', 'trckable' ) );
		}

		$out['server'] = ( isset( $in['server'] ) && 'own' === $in['server'] ) ? 'own' : 'cloud';
		$host          = isset( $in['host'] ) ? Trckable_Options::clean_host( $in['host'] ) : '';
		if ( '' !== $host ) {
			$out['host'] = $host;
		} elseif ( 'own' === $out['server'] ) {
			$out['host']   = Trckable_Options::clean_host( $old['host'] );
			$out['server'] = '' === $out['host'] ? 'cloud' : 'own';
			add_settings_error( self::PAGE, 'trckable_host', __( 'The address needs https (http works for localhost).', 'trckable' ) );
		}

		$out['cookieless']    = empty( $in['cookieless'] ) ? 0 : 1;
		$out['exclude_staff'] = empty( $in['exclude_staff'] ) ? 0 : 1;
		$out['proxy']         = empty( $in['proxy'] ) ? 0 : 1;
		$out['onboarding']    = array_key_exists( 'onboarding', $in ) ? (int) ! empty( $in['onboarding'] ) : $old['onboarding'];

		$roles                = isset( $in['exclude_roles'] ) && is_array( $in['exclude_roles'] ) ? array_map( 'sanitize_key', $in['exclude_roles'] ) : array();
		$out['exclude_roles'] = array_values( array_intersect( $roles, array_keys( wp_roles()->get_names() ) ) );

		foreach ( array(
			'proxy_key' => __( 'The proxy key has letters, digits, _ and - only.', 'trckable' ),
			'api_key'   => __( 'The API key has letters, digits, _ and - only.', 'trckable' ),
		) as $name => $message ) {
			$key = isset( $in[ $name ] ) ? trim( sanitize_text_field( $in[ $name ] ) ) : '';
			if ( '' === $key || Trckable_Options::valid_key( $key ) ) {
				$out[ $name ] = $key;
			} else {
				$out[ $name ] = $old[ $name ];
				add_settings_error( self::PAGE, 'trckable_' . $name, $message );
			}
		}
		if ( $out['proxy'] && ! Trckable_Options::valid_key( $out['proxy_key'] ) ) {
			$out['proxy'] = 0;
			add_settings_error( self::PAGE, 'trckable_proxy', __( 'Add the proxy key to turn this on.', 'trckable' ) );
		}

		delete_transient( 'trckable_script' );
		delete_transient( Trckable_Stats::KEY );
		return $out;
	}
}
