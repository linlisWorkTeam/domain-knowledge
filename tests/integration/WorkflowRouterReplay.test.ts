/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：验收 Registry 已提交而 LangGraph 尚未保存路由时的故障恢复。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { agentScenario } from '../helpers/AgentScenario.ts';

for (const qualityFailure of [false,true]) for (const limit of [1,2]) {
  test(`AC-AGENT-105-R1: ${qualityFailure?'quality':'Gate'} ${limit===1?'STOPPED':'ITERATE'} survives the graph checkpoint gap`,async()=>{
    let crash=true;
    const env=await agentScenario({qualityFailure,afterRouter(){if(crash){crash=false;throw new Error('INJECTED_AFTER_REGISTRY_BEFORE_GRAPH');}}});
    try{
      const handle=await env.workflow.start(env.f.scenario,{policyId:'boundary',minimumStability:1,requireAllTests:true,maxIterations:limit,workerCount:0});
      const interrupted=await env.engine.wait(handle.runId);
      assert.equal(interrupted.executionStatus,'FAILED');
      assert.match(interrupted.error??'',/INJECTED_AFTER_REGISTRY/);
      const events=()=>env.c.repository.listEvents(handle.runId);
      const gates=events().filter(e=>e.eventType==='GateDecided').length;
      const original={...env.routes[0]!,context:{...env.routes[0]!.context}};
      delete original.context['gateDecision:0']; // Graph never received the first output.
      const replay=await env.stages.execute(original);
      assert.equal(replay.route,limit===1?'STOPPED':'ITERATE');
      assert.equal(env.c.service.getRun(handle.runId)!.iteration,limit-1);
      assert.equal(events().filter(e=>e.eventType==='GateDecided').length,gates);
      await env.engine.resume(handle.runId);
      const result=await env.engine.wait(handle.runId);
      assert.equal(result.route,qualityFailure||limit===1?'STOPPED':'PASS',result.error??'');
      assert.equal(result.iteration,limit-1);
      assert.equal(events().filter(e=>e.eventType==='ReviewHandoffPrepared').length,qualityFailure||limit===1?1:0);
    }finally{env.dispose();}
  });
}

test('AC-AGENT-105-R1: durable route resumes when transition has not executed',async()=>{
  const env=await agentScenario({qualityFailure:true});
  try{
    const transition=env.c.service.transition.bind(env.c.service);let crash=true;
    env.c.service.transition=(id,state)=>{if(state==='ITERATING'&&crash){crash=false;throw new Error('INJECTED_BEFORE_TRANSITION');}return transition(id,state);};
    const handle=await env.workflow.start(env.f.scenario,{policyId:'boundary',minimumStability:1,requireAllTests:true,maxIterations:2,workerCount:0});
    assert.equal((await env.engine.wait(handle.runId)).executionStatus,'FAILED');
    assert.equal(env.c.service.getRun(handle.runId)!.iteration,0);
    await env.engine.resume(handle.runId);
    assert.equal((await env.engine.wait(handle.runId)).route,'STOPPED');
    assert.equal(env.c.service.getRun(handle.runId)!.iteration,1);
  }finally{env.dispose();}
});

test('AC-AGENT-105-R1: Gate commit survives failure before route persistence and rejects changed replay inputs',async()=>{
  const env=await agentScenario();
  try{
    const put=env.c.service.putArtifact.bind(env.c.service);let crash=true;
    env.c.service.putArtifact=async(bytes,type)=>{
      let value: any;try{value=JSON.parse(Buffer.from(bytes).toString());}catch{}
      if(crash&&value?.context?.['gateDecision:0']) {crash=false;throw new Error('INJECTED_AFTER_GATE_BEFORE_ROUTE');}
      return put(bytes,type);
    };
    const handle=await env.workflow.start(env.f.scenario,{policyId:'boundary',minimumStability:1,requireAllTests:true,maxIterations:2,workerCount:0});
    assert.equal((await env.engine.wait(handle.runId)).executionStatus,'FAILED');
    assert.equal(env.c.service.getRun(handle.runId)!.state,'REVIEWING');
    await env.engine.resume(handle.runId);
    assert.equal((await env.engine.wait(handle.runId)).route,'PASS');
    assert.equal(env.c.repository.listEvents(handle.runId).filter(e=>e.eventType==='GateDecided').length,2);
    await assert.rejects(env.stages.execute({...env.routes[0]!,maxIterations:3}),/generationKey input collision/);
  }finally{env.dispose();}
});
