import axios from "axios";

export const api = axios.create({
  baseURL: "http://155.117.6.87/api",
});