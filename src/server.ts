import { env } from "./env";
import { createApp } from "./app";

const app = createApp();
app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`JobLog API listening on :${env.PORT}`);
});
