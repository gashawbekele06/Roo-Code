# Intent Map

Living document that maps formalized business intents to concrete locations in the codebase.

## INT-001: Build Weather API

**Description**  
Implement a public weather data endpoint using open APIs (no paid services).

**Primary Files / Directories**

- `src/api/weather/index.ts` – main endpoint handler
- `src/api/weather/service.ts` – business logic & API client
- `src/middleware/rate-limit.ts` – rate limiting applied to weather routes
- `tests/api/weather.test.ts` – unit & integration tests

**Key AST Nodes / Functions**

- `getCurrentWeather` function (lines ~45–78 in `service.ts`)
- `WeatherClient.fetchData` method (lines ~120–145 in `service.ts`)
- Route definition `router.get('/weather/current', ...)` (lines ~15–25 in `index.ts`)

**Last Updated**  
2026-02-20

## INT-002: Refactor Auth Middleware

**Description**  
Migrate from Basic Auth to JWT-based authentication while maintaining backward compatibility.

**Primary Files / Directories**

- `src/middleware/auth.ts` – main auth middleware
- `src/auth/jwt.ts` – JWT utilities (sign, verify)
- `src/routes/protected.ts` – routes that require auth
- `tests/middleware/auth.test.ts` – auth behavior tests

**Key AST Nodes / Functions**

- `authenticateJWT` middleware function (lines ~30–65 in `auth.ts`)
- `verifyToken` function (lines ~80–110 in `jwt.ts`)
- Old `basicAuth` function – marked deprecated (lines ~10–25 in `auth.ts`)

**Migration Notes**

- All new protected routes must use JWT
- Legacy Basic Auth endpoints still supported via fallback

**Last Updated**  
2026-02-20
