import { handleRequest } from "../server.mjs";

export default async function analyze(request, response) {
  request.url = "/api/analyze";
  request.method = "POST";
  return handleRequest(request, response);
}
