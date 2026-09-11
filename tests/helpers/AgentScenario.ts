/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：用受控角色响应驱动真实 LangGraph 和 C++ 测评以验收边界。
 */
import { createTestComposition, GOOD_BODY } from './Fixture.ts';
import { cppScenario, cppTestOutput, orchestratorOutput } from './CppScenario.ts';
import { ProjectWorkflowStages, AutomatedProjectWorkflowService } from '../../src/application/services/AutomatedProjectWorkflow.ts';
import { TrustedProjectEvaluator } from '../../src/infrastructure/evaluation/project/TrustedProjectEvaluator.ts';
import { JsonSchemaAgentContractValidator } from '../../src/infrastructure/agentAdapters/contracts/JsonSchemaAgentContractValidator.ts';
import { assertModelOutput } from '../../src/infrastructure/agentAdapters/ModelExecution.ts';
import { createDomainKnowledgeInfrastructure } from '../../src/infrastructure/langgraph/LangGraph.ts';
import { NODE_BY_AGENT } from '../../src/domain/workflow/AgentDefinitions.ts';
import type { WorkflowStageInput } from '../../src/application/ports/ApplicationPorts.ts';

export async function agentScenario(options: { qualityFailure?: boolean; testFailure?: boolean; proposal?: boolean; afterRouter?: (input: WorkflowStageInput) => void } = {}) {
  const c = createTestComposition(), f = cppScenario();
  const calls: {role:string;iteration:number;prompt:string}[] = [];
  const routes: WorkflowStageInput[] = [];
  const stages = new ProjectWorkflowStages({ flywheel:c.service, evalRunner:c.apps.evalRunner,
    evaluator:new TrustedProjectEvaluator(c.artifacts),nodeByAgent:NODE_BY_AGENT,
    contracts:new JsonSchemaAgentContractValidator('docs/specs/schemas'),
    modelFactory:({command,stage})=>({assertOutput:assertModelOutput,execute:async(request)=>{
      calls.push({role:command.agentType,iteration:stage.iteration,prompt:request.prompt});
      switch(command.agentType){
        case 'orchestrator':return orchestratorOutput(f.scenario.moduleId,stage.iteration);
        case 'test-gen':return cppTestOutput(options.testFailure ? 3 : 4);
        case 'doc-gen':if(options.proposal) return {splitProposal:{reason:'Two independent topics require a scope decision',suggestedDocuments:['API contract','Internal flow']}};return {title:'Module knowledge',description:'Precise public behavior',keywords:['module'],
          body:options.qualityFailure ? 'Short unsupported statement. '.repeat(9) : `${GOOD_BODY}\n\n## Behavior\n\nResult is ${stage.iteration ? 4 : 3}.`};
        case 'code':return {files:[{path:'src/module.cpp',content:`int calculate(){return ${stage.iteration ? 4 : 3};}\n`}]};
        case 'check':return {blocking:false,findings:[],scope:['src/module.cpp']};
        case 'review':return {blocking:stage.iteration===0,historySummary:'The earlier result was wrong and the corrected value passes.',corrections:stage.iteration ? [] : [{correctionId:'COR-0001',knowledgePath:'Behavior',problem:'Expected 4, actual 3',suggestion:'Return 4',evidence:['evaluation']}]};
        default:throw new Error('UNEXPECTED_ROLE');
      }
    }}) });
  const infrastructure = await createDomainKnowledgeInfrastructure({executor:{async execute(input){const result=await stages.execute(input);if(input.nodeId==='workflow_router') routes.push({ ...input, context: { ...input.context, ...result.context } });if(input.nodeId==='workflow_router') options.afterRouter?.(input);return result;}},observer:c.workflowObserver,
    prompts:c.runConfiguration,checkpoint:{kind:'memory'}});
  const workflow=new AutomatedProjectWorkflowService(c.service,infrastructure.engine,c.runConfiguration);
  return {c,f,stages,workflow,calls,routes,engine:infrastructure.engine,
    async start(maxIterations:number){
      const handle=await workflow.start(f.scenario,{policyId:'boundary',minimumStability:1,requireAllTests:true,maxIterations,workerCount:0});
      return {handle,result:await workflow.wait(handle.runId)};
    },
    input(iteration:number,maxIterations:number):WorkflowStageInput {
      const run=c.service.createRun(f.scenario.moduleId,'boundary');
      return {runId:run.runId,nodeId:'orchestrator',agentId:'orchestrator',iteration,attempt:1,maxIterations,workerCount:0,prompt:'plan',
        context:{scenario:f.scenario,gatePolicy:{policyId:'boundary',minimumStability:1,requireAllTests:true,maxIterations}}};
    },
    dispose(){c.dispose();f.cleanup();}
  };
}
