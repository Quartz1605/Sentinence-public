import axios from "axios";

const backendBaseUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? process.env.BACKEND_URL ?? "http://localhost:8000";

export const backendClient = axios.create({
  baseURL: backendBaseUrl,
  withCredentials: true,
});
