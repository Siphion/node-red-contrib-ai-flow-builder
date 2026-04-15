module.exports = function (RED) {
  function AiProviderConfigNode(config) {
    RED.nodes.createNode(this, config);
    this.name = config.name;
    this.label = config.name; // keep backwards/backend-friendly alias
    this.provider = config.provider; // "openai" | "anthropic"
    this.model = config.model;
    this.baseUrl = config.baseUrl || "";
    // this.credentials.apiKey is encrypted by Node-RED
  }

  RED.nodes.registerType("ai-provider-config", AiProviderConfigNode, {
    credentials: {
      apiKey: { type: "password" }
    }
  });
};
