# @express-zod/client

Type-safe API client for ExpressZod.

## Install

```bash
npm i @express-zod/client
```

## Usage

```ts
// in server
import { Application } from "express-zod";

const app = new Application().get("/hello");
app.listen(3000);
export type App = typeof app;
```

```ts
// in client
import { defineClient } from "@express-zod/client";
import type { App } from "path/to/your/server";

const client = defineClient<App>("http://localhost:3000/");
client.hello();
```

## License

[MIT](https://opensource.org/licenses/MIT)
