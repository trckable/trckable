<?php
/**
 * Settings → trckable.
 *
 * @package trckable
 */

defined( 'ABSPATH' ) || exit;

/**
 * The settings page, built on the Settings API: WordPress checks the nonce, this
 * class checks the capability and cleans every value.
 */
class Trckable_Settings {

	const PAGE = 'trckable';

	/**
	 * Hooks the page in.
	 *
	 * @return void
	 */
	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'register' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( TRCKABLE_FILE ), array( __CLASS__, 'links' ) );
	}

	/**
	 * Adds Settings → trckable.
	 *
	 * @return void
	 */
	public static function menu() {
		add_options_page( __( 'trckable', 'trckable' ), __( 'trckable', 'trckable' ), 'manage_options', self::PAGE, array( __CLASS__, 'render' ) );
	}

	/**
	 * Adds a Settings link in the plugin list.
	 *
	 * @param array $links The links.
	 * @return array
	 */
	public static function links( $links ) {
		$mine = '<a href="' . esc_url( admin_url( 'options-general.php?page=' . self::PAGE ) ) . '">' . esc_html__( 'Settings', 'trckable' ) . '</a>';
		return array_merge( array( $mine ), $links );
	}

	/**
	 * Registers the option and its fields.
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
		add_settings_section( 'trckable_main', '', '__return_false', self::PAGE );
		$fields = array(
			'site'          => __( 'Site ID', 'trckable' ),
			'host'          => __( 'Server', 'trckable' ),
			'cookieless'    => __( 'Cookieless', 'trckable' ),
			'exclude_staff' => __( 'Skip admins and editors', 'trckable' ),
			'exclude_roles' => __( 'Skip roles', 'trckable' ),
			'proxy'         => __( 'Through this site', 'trckable' ),
			'proxy_key'     => __( 'Proxy key', 'trckable' ),
			'api_key'       => __( 'API key', 'trckable' ),
		);
		foreach ( $fields as $id => $label ) {
			add_settings_field(
				'trckable_' . $id,
				$label,
				array( __CLASS__, 'field_' . $id ),
				self::PAGE,
				'trckable_main',
				array( 'label_for' => 'trckable_' . $id )
			);
		}
	}

	/**
	 * Cleans what was submitted. Only people who manage options get here.
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

		$site = isset( $in['site'] ) ? sanitize_text_field( wp_unslash( $in['site'] ) ) : '';
		if ( '' === $site || Trckable_Options::valid_site( $site ) ) {
			$out['site'] = $site;
		} else {
			$out['site'] = $old['site'];
			add_settings_error( self::PAGE, 'trckable_site', __( 'The site ID looks like tkb_ followed by letters and digits.', 'trckable' ) );
		}

		$host = isset( $in['host'] ) ? Trckable_Options::clean_host( wp_unslash( $in['host'] ) ) : '';
		if ( '' !== $host ) {
			$out['host'] = $host;
		} else {
			$out['host'] = Trckable_Options::clean_host( $old['host'] ) ? $old['host'] : Trckable_Options::DEFAULT_HOST;
			add_settings_error( self::PAGE, 'trckable_host', __( 'The server must be an http or https address.', 'trckable' ) );
		}

		$out['cookieless']    = empty( $in['cookieless'] ) ? 0 : 1;
		$out['exclude_staff'] = empty( $in['exclude_staff'] ) ? 0 : 1;
		$out['proxy']         = empty( $in['proxy'] ) ? 0 : 1;

		$roles                = isset( $in['exclude_roles'] ) && is_array( $in['exclude_roles'] ) ? array_map( 'sanitize_key', wp_unslash( $in['exclude_roles'] ) ) : array();
		$out['exclude_roles'] = array_values( array_intersect( $roles, array_keys( wp_roles()->get_names() ) ) );

		foreach ( array(
			'proxy_key' => __( 'The proxy key has letters, digits, _ and - only.', 'trckable' ),
			'api_key'   => __( 'The API key has letters, digits, _ and - only.', 'trckable' ),
		) as $name => $message ) {
			$key = isset( $in[ $name ] ) ? trim( sanitize_text_field( wp_unslash( $in[ $name ] ) ) ) : '';
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
		delete_transient( 'trckable_widget' );
		return $out;
	}

	/**
	 * A small help mark with a tooltip.
	 *
	 * @param string $text The tooltip.
	 * @return void
	 */
	private static function tip( $text ) {
		printf(
			' <span class="dashicons dashicons-editor-help" title="%1$s" aria-label="%1$s" role="img" style="color:#646970;cursor:help"></span>',
			esc_attr( $text )
		);
	}

	/**
	 * A text or password input.
	 *
	 * @param string $name  Setting name.
	 * @param string $type  Input type.
	 * @param string $extra Extra attributes, already escaped.
	 * @return void
	 */
	private static function input( $name, $type, $extra = '' ) {
		$o = Trckable_Options::get();
		printf(
			'<input type="%1$s" id="trckable_%2$s" name="%3$s[%2$s]" value="%4$s" class="regular-text" autocomplete="off" spellcheck="false" %5$s />',
			esc_attr( $type ),
			esc_attr( $name ),
			esc_attr( Trckable_Options::NAME ),
			esc_attr( $o[ $name ] ),
			$extra // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- built from literals in this file.
		);
	}

	/**
	 * A checkbox with its label.
	 *
	 * @param string $name  Setting name.
	 * @param string $label The label.
	 * @param string $tip   Tooltip, optional.
	 * @return void
	 */
	private static function checkbox( $name, $label, $tip = '' ) {
		$o = Trckable_Options::get();
		printf(
			'<label><input type="checkbox" id="trckable_%1$s" name="%2$s[%1$s]" value="1" %3$s /> %4$s</label>',
			esc_attr( $name ),
			esc_attr( Trckable_Options::NAME ),
			checked( ! empty( $o[ $name ] ), true, false ),
			esc_html( $label )
		);
		if ( '' !== $tip ) {
			self::tip( $tip );
		}
	}

	/**
	 * The site id field.
	 *
	 * @return void
	 */
	public static function field_site() {
		self::input( 'site', 'text', 'placeholder="tkb_a1b2c3d4e5f6" pattern="tkb_[A-Za-z0-9]{4,64}"' );
		self::tip( __( 'trckable, Settings, Install: the id starting with tkb_', 'trckable' ) );
	}

	/**
	 * The server field.
	 *
	 * @return void
	 */
	public static function field_host() {
		self::input( 'host', 'url', 'placeholder="https://stats.example.com"' );
		self::tip( __( 'Where trckable runs. Self-hosting: your own address.', 'trckable' ) );
	}

	/**
	 * The cookieless switch.
	 *
	 * @return void
	 */
	public static function field_cookieless() {
		self::checkbox( 'cookieless', __( 'No cookies, no banner needed', 'trckable' ), __( 'Visitors are counted without storing anything in their browser.', 'trckable' ) );
	}

	/**
	 * The staff switch.
	 *
	 * @return void
	 */
	public static function field_exclude_staff() {
		self::checkbox( 'exclude_staff', __( 'Do not count logged-in admins and editors', 'trckable' ) );
	}

	/**
	 * The roles list.
	 *
	 * @return void
	 */
	public static function field_exclude_roles() {
		$o = Trckable_Options::get();
		echo '<fieldset>';
		foreach ( wp_roles()->get_names() as $role => $name ) {
			printf(
				'<span style="display:inline-block;margin-right:1.5em"><label><input type="checkbox" name="%1$s[exclude_roles][]" value="%2$s" %3$s /> %4$s</label></span>',
				esc_attr( Trckable_Options::NAME ),
				esc_attr( $role ),
				checked( in_array( $role, (array) $o['exclude_roles'], true ), true, false ),
				esc_html( translate_user_role( $name ) )
			);
		}
		echo '</fieldset>';
	}

	/**
	 * The proxy switch.
	 *
	 * @return void
	 */
	public static function field_proxy() {
		self::checkbox(
			'proxy',
			__( 'Send the script and events through this site', 'trckable' ),
			__( 'Blockers do not see a third-party address, and visitors keep their own country. Needs the proxy key.', 'trckable' )
		);
	}

	/**
	 * The proxy key field.
	 *
	 * @return void
	 */
	public static function field_proxy_key() {
		self::input( 'proxy_key', 'password', 'placeholder="tkb_px_…"' );
		self::tip( __( 'trckable, Settings, Install', 'trckable' ) );
	}

	/**
	 * The API key field.
	 *
	 * @return void
	 */
	public static function field_api_key() {
		self::input( 'api_key', 'password', 'placeholder="tkb_live_…"' );
		self::tip( __( 'Optional. A read-only key for the dashboard widget.', 'trckable' ) );
	}

	/**
	 * Draws the page.
	 *
	 * @return void
	 */
	public static function render() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		echo '<div class="wrap"><h1>' . esc_html( get_admin_page_title() ) . '</h1>';
		echo '<form method="post" action="options.php">';
		settings_fields( self::PAGE );
		do_settings_sections( self::PAGE );
		submit_button();
		echo '</form></div>';
	}
}
