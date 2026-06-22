import { handleRequest } from "../server.mjs";

export default async function status(request, response) {
  request.url = "/api/status";
  request.method = "GET";
  return handleRequest(request, response);
}
