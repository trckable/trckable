/* The DuckDB extensions the server uses, and no others (deploy/Dockerfile).
 * DuckDB's own loader registers every extension its prebuilt libraries carry,
 * and registering one links it into the binary: TPC-H, TPC-DS, autocomplete and
 * the HTTP client then weigh several MB of an image that has a budget. The
 * server needs the core functions, time zones (icu), JSON (event props) and
 * Parquet (backup and restore). */
#define DUCKDB_STATIC_BUILD
#include "duckdb_static_extension.h"

int32_t duckdb_extension_core_functions_describe(duckdb_extension_descriptor *descriptor);
int32_t duckdb_extension_icu_describe(duckdb_extension_descriptor *descriptor);
int32_t duckdb_extension_json_describe(duckdb_extension_descriptor *descriptor);
int32_t duckdb_extension_parquet_describe(duckdb_extension_descriptor *descriptor);

int32_t duckdb_register_static_extensions(void) {
	int32_t result = 0;
	result |= duckdb_register_static_extension(duckdb_extension_core_functions_describe) != 0;
	result |= duckdb_register_static_extension(duckdb_extension_icu_describe) != 0;
	result |= duckdb_register_static_extension(duckdb_extension_json_describe) != 0;
	result |= duckdb_register_static_extension(duckdb_extension_parquet_describe) != 0;
	return result;
}
