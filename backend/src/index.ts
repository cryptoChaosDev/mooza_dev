import { createServer } from "http";
import app from "./server";

const port = Number(process.env.PORT || 4000);
const server = createServer(app);

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
});

export default server;

