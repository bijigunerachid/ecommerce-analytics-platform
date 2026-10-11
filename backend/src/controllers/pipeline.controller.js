export function createPipelineController({ pipelineService }) {
  return {
    async health(_req, res) {
      res.json(await pipelineService.health());
    },
  };
}
