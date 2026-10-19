package channels_test

// Answers as the platforms gave them, kept as they were recorded (ids and
// tokens replaced by made-up ones), so the connectors are tested against the
// real shapes: a bare number for Instagram's user id, a string for its
// username, Meta's day ending at 07:00 UTC, Google's rows as arrays.
const (
	ytChannels = `{"kind":"youtube#channelListResponse","etag":"abc","pageInfo":{"totalResults":1,"resultsPerPage":5},"items":[{"kind":"youtube#channel","etag":"def","id":"UCmakerchannel0001","snippet":{"title":"Maker Studio","customUrl":"@makerstudio","publishedAt":"2020-03-01T10:00:00Z"}}]}`
	ytReport   = `{"kind":"youtubeAnalytics#resultTable","columnHeaders":[{"name":"day","columnType":"DIMENSION","dataType":"STRING"},{"name":"views","columnType":"METRIC","dataType":"INTEGER"}],"rows":[["2026-09-19",120],["2026-09-20",98],["2026-09-21",143]]}`

	igShort    = `{"access_token":"IGAA-SHORT-LIVED-FAKE","user_id":17841400000000001,"permissions":"instagram_business_basic,instagram_business_manage_insights"}`
	igLong     = `{"access_token":"IGAA-LONG-LIVED-FAKE","token_type":"bearer","expires_in":5183944}`
	igMe       = `{"user_id":"17841400000000001","username":"maker.studio","id":"9988776655"}`
	igInsights = `{"data":[{"name":"views","period":"day","title":"Views","description":"The number of times your content was played or displayed.","total_value":{"value":321},"id":"17841400000000001/insights/views/day"}]}`

	thShort    = `{"access_token":"THAA-SHORT-LIVED-FAKE","user_id":24500000000001}`
	thLong     = `{"access_token":"THAA-LONG-LIVED-FAKE","token_type":"bearer","expires_in":5184000}`
	thMe       = `{"id":"24500000000001","username":"maker.studio"}`
	thInsights = `{"data":[{"name":"views","period":"day","values":[{"value":10,"end_time":"2026-09-19T07:00:00+0000"},{"value":14,"end_time":"2026-09-20T07:00:00+0000"},{"value":9,"end_time":"2026-09-21T07:00:00+0000"}],"title":"Views","description":"The number of times your posts were viewed.","id":"24500000000001/insights/views/day"}]}`

	metaThrottled = `{"error":{"message":"Application request limit reached","type":"OAuthException","code":4,"fbtrace_id":"AbC"}}`
	metaExpired   = `{"error":{"message":"Error validating access token: Session has expired","type":"OAuthException","code":190,"fbtrace_id":"AbC"}}`
	googleQuota   = `{"error":{"code":403,"message":"Quota exceeded","errors":[{"reason":"quotaExceeded"}]}}`
	googleGrant   = `{"error":"invalid_grant","error_description":"Token has been expired or revoked."}`
)
