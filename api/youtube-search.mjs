import { handleRequest } from "../server.mjs";

export default async function youtubeSearch(request, response) {
  request.url = "/api/youtube-search";
  request.method = "POST";
  return handleRequest(request, response);
}
