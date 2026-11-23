// Función de Netlify que atiende /api/* con los datos guardados en Netlify Blobs.
import { getStore } from "@netlify/blobs";
import { handle } from "./lib/core.mjs";

export default async (req, context) => {
  const store = getStore({ name: "comunidad", consistency: "strong" });
  return handle(req, { store, adminKey: process.env.ADMIN_KEY || "", ip: context.ip });
};

export const config = { path: "/api/*" };
