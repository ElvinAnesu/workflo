import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The SQL Server driver runs in Node only; load it at runtime rather than
  // bundling it.
  serverExternalPackages: ["mssql"],
};

export default nextConfig;
