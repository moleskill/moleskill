import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");
export default withNextIntl({ experimental: { useTypeScriptCli: false, cpus: 1 } });
