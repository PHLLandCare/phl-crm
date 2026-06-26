const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./index-DqsKYlwG.js","./index-D1oyTWt8.css"])))=>i.map(i=>d[i]);
import{c as e,d as t,n,t as r}from"./index-DqsKYlwG.js";
var a=t(e(),1),sb=r();

function ChecklistsPage(){
  var [templates,setTemplates]=a.useState([]);
  var [active,setActive]=a.useState([]);
  var [jobs,setJobs]=a.useState([]);
  var [tab,setTab]=a.useState("templates");
  var [loading,setLoading]=a.useState(true);
  var [toast,setToast]=a.useState("");
  var [showTmpl,setShowTmpl]=a.useState(false);
  var [editId,setEditId]=a.useState(null);
  var [tmplName,setTmplName]=a.useState("");
  var [tmplDiv,setTmplDiv]=a.useState("");
  var [tmplDesc,setTmplDesc]=a.useState("");
  var [tmplItems,setTmplItems]=a.useState([]);
  var [newItem,setNewItem]=a.useState("");
  var [saving,setSaving]=a.useState(false);
  var [showAttach,setShowAttach]=a.useState(false);
  var [attachTmplId,setAttachTmplId]=a.useState("");
  var [attachJobId,setAttachJobId]=a.useState("");
  var [showDetail,setShowDetail]=a.useState(false);
  var [detailCk,setDetailCk]=a.useState(null);
  var [detailItems,setDetailItems]=a.useState([]);
  var [detailNotes,setDetailNotes]=a.useState("");
  var [search,setSearch]=a.useState("");
  var [filterStatus,setFilterStatus]=a.useState("");

  function showToast(msg){setToast(msg);setTimeout(()=>setToast(""),3500);}

  a.useEffect(()=>{loadAll();},[]);

  async function loadAll(){
    setLoading(true);
    try{
      var [tm,ac,jb]=await Promise.all([
        sb.from("checklist_templates").select("*").order("created_at",{ascending:false}),
        sb.from("job_checklists").select("*").order("created_at",{ascending:false}),
        sb.from("jobs").select("id,title,client_name,status").order("created_at",{ascending:false}).limit(200)
      ]);
      setTemplates(tm.data||[]);
      setActive(ac.data||[]);
      setJobs(jb.data||[]);
    }catch(err){showToast("Error loading: "+err.message);}
    setLoading(false);
  }

  function openNewTemplate(){setEditId(null);setTmplName("");setTmplDiv("");setTmplDesc("");setTmplItems([]);setNewItem("");setShowTmpl(true);}
  function openEditTemplate(tmpl){setEditId(tmpl.id);setTmplName(tmpl.name||"");setTmplDiv(tmpl.division||"");setTmplDesc(tmpl.description||"");setTmplItems((tmpl.items||[]).map(i=>typeof i==="string"?i:(i.label||"")));setNewItem("");setShowTmpl(true);}
  function addItem(){var txt=newItem.trim();if(!txt)return;setTmplItems(prev=>[...prev,txt]);setNewItem("");}
  function removeItem(idx){setTmplItems(prev=>prev.filter((_,i)=>i!==idx));}

  async function saveTmpl(){
    if(!tmplName.trim()){showToast("Enter a template name");return;}
    if(!tmplItems.length){showToast("Add at least one item");return;}
    setSaving(true);
    var payload={name:tmplName.trim(),division:tmplDiv,description:tmplDesc.trim(),items:tmplItems.map(l=>({label:l,checked:false}))};
    try{
      if(editId){await sb.from("checklist_templates").update(payload).eq("id",editId);}
      else{await sb.from("checklist_templates").insert(payload);}
      showToast(editId?"Template updated!":"Template created!");
      setShowTmpl(false);loadAll();
    }catch(err){showToast("Error: "+err.message);}
    setSaving(false);
  }

  async function deleteTmpl(id){if(!confirm("Delete this template?"))return;await sb.from("checklist_templates").delete().eq("id",id);showToast("Deleted");loadAll();}

  function openAttach(tmplId){setAttachTmplId(String(tmplId||""));setAttachJobId("");setShowAttach(true);}

  async function saveAttach(){
    if(!attachJobId){showToast("Select a job");return;}
    if(!attachTmplId){showToast("Select a template");return;}
    var tmpl=templates.find(t=>String(t.id)===String(attachTmplId));
    var job=jobs.find(j=>String(j.id)===String(attachJobId));
    if(!tmpl)return;
    var payload={job_id:parseInt(attachJobId),job_title:job?job.title:"",client_name:job?job.client_name:"",template_id:parseInt(attachTmplId),template_name:tmpl.name,items:(tmpl.items||[]).map(i=>({label:i.label||i,checked:false})),status:"not_started",notes:""};
    try{await sb.from("job_checklists").insert(payload);showToast("Attached!");setShowAttach(false);loadAll();}
    catch(err){showToast("Error: "+err.message);}
  }

  function openDetail(ck){setDetailCk(ck);setDetailItems(JSON.parse(JSON.stringify(ck.items||[])));setDetailNotes(ck.notes||"");setShowDetail(true);}
  function toggleItem(idx){setDetailItems(prev=>prev.map((item,i)=>i===idx?{...item,checked:!item.checked}:item));}

  async function saveDetail(){
    if(!detailCk)return;
    var done=detailItems.filter(i=>i.checked).length;
    var status=done===0?"not_started":done===detailItems.length?"completed":"in_progress";
    setSaving(true);
    try{await sb.from("job_checklists").update({items:detailItems,status,notes:detailNotes}).eq("id",detailCk.id);showToast("Saved!");setShowDetail(false);loadAll();}
    catch(err){showToast("Error: "+err.message);}
    setSaving(false);
  }

  async function deleteActive(id){if(!confirm("Remove this checklist?"))return;await sb.from("job_checklists").delete().eq("id",id);showToast("Removed");loadAll();}

  var filteredActive=active.filter(ac=>{
    var mq=!search||(ac.job_title||"").toLowerCase().includes(search.toLowerCase())||(ac.client_name||"").toLowerCase().includes(search.toLowerCase())||(ac.template_name||"").toLowerCase().includes(search.toLowerCase());
    var ms=!filterStatus||ac.status===filterStatus;
    return mq&&ms;
  });

  var card={background:"#0f172a",border:"1px solid #1e293b",borderRadius:12,padding:16,marginBottom:10};
  var btn={padding:"8px 14px",border:"1px solid #1e293b",borderRadius:8,background:"rgba(255,255,255,.05)",color:"#f1f5f9",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"inherit"};
  var btnPr={...btn,background:"#16a34a",border:"none"};
  var btnRd={...btn,color:"#f87171",borderColor:"rgba(248,113,113,.3)"};
  var inp={padding:"10px 12px",background:"#1a2332",border:"1px solid #2d3f55",borderRadius:8,fontSize:13,color:"#f1f5f9",fontFamily:"inherit",outline:"none",width:"100%",boxSizing:"border-box"};
  var lbl={fontSize:11,fontWeight:700,color:"#64748b",display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"};
  var sColor={not_started:"#64748b",in_progress:"#f59e0b",completed:"#22c55e"};
  var sLabel={not_started:"Not started",in_progress:"In progress",completed:"Completed"};
  var ov={position:"fixed",inset:0,background:"rgba(0,0,0,.7)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16};
  var modal={background:"#0f172a",border:"1px solid #1e293b",borderRadius:16,width:"100%",maxWidth:560,maxHeight:"90vh",overflow:"auto"};
  var mh={display:"flex",justifyContent:"space-between",alignItems:"center",padding:"20px 24px 16px",borderBottom:"1px solid #1e293b"};
  var mf={display:"flex",gap:8,justifyContent:"flex-end",padding:"16px 24px",borderTop:"1px solid #1e293b"};
  var mb={padding:"20px 24px",display:"flex",flexDirection:"column",gap:14};

  return a.createElement(a.Fragment,null,
    toast&&a.createElement("div",{style:{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#0f172a",color:"#fff",padding:"12px 22px",borderRadius:10,fontSize:13,fontWeight:600,borderLeft:"4px solid #22c55e",zIndex:9999,boxShadow:"0 6px 24px rgba(0,0,0,.5)",whiteSpace:"nowrap"}},toast),

    a.createElement("div",{style:{padding:"0 2rem 2rem",maxWidth:1200,margin:"0 auto"}},
      a.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"1.5rem",flexWrap:"wrap",gap:12}},
        a.createElement("div",null,
          a.createElement("h1",{style:{margin:0,fontSize:26,fontWeight:700,color:"#f1f5f9"}},"Checklists"),
          a.createElement("p",{style:{margin:"4px 0 0",fontSize:13,color:"#64748b"}},"Job quality checklists and inspection templates")
        ),
        a.createElement("button",{style:btnPr,onClick:openNewTemplate},"+ New template")
      ),

      a.createElement("div",{style:{display:"flex",gap:6,marginBottom:20}},
        a.createElement("button",{style:{...btn,...(tab==="templates"?{background:"rgba(34,197,94,.15)",borderColor:"#22c55e",color:"#4ade80"}:{})},onClick:()=>setTab("templates")},"📋 Templates ("+templates.length+")"),
        a.createElement("button",{style:{...btn,...(tab==="active"?{background:"rgba(34,197,94,.15)",borderColor:"#22c55e",color:"#4ade80"}:{})},onClick:()=>setTab("active")},"✅ Active ("+active.length+")")
      ),

      loading&&a.createElement("div",{style:{textAlign:"center",padding:"3rem",color:"#64748b"}},"Loading..."),

      !loading&&tab==="templates"&&a.createElement("div",null,
        !templates.length&&a.createElement("div",{style:{...card,textAlign:"center",padding:40,color:"#475569"}},
          a.createElement("div",{style:{fontSize:40,marginBottom:12}},"📋"),
          a.createElement("div",{style:{fontWeight:600,marginBottom:6}},"No templates yet"),
          a.createElement("button",{style:{...btnPr,marginTop:12},onClick:openNewTemplate},"+ Create first template")
        ),
        templates.map(tmpl=>a.createElement("div",{key:tmpl.id,style:card},
          a.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}},
            a.createElement("div",{style:{flex:1}},
              a.createElement("div",{style:{fontWeight:700,color:"#f1f5f9",fontSize:15,marginBottom:3}},tmpl.name),
              a.createElement("div",{style:{fontSize:12,color:"#64748b"}},(tmpl.division||"All divisions")+" · "+(tmpl.items||[]).length+" items")
            ),
            a.createElement("div",{style:{display:"flex",gap:5,flexShrink:0,flexWrap:"wrap"}},
              a.createElement("button",{style:{...btn,color:"#22c55e",borderColor:"rgba(34,197,94,.3)"},onClick:()=>openAttach(tmpl.id)},"🔗 Attach"),
              a.createElement("button",{style:btn,onClick:()=>openEditTemplate(tmpl)},"✏️ Edit"),
              a.createElement("button",{style:btnRd,onClick:()=>deleteTmpl(tmpl.id)},"🗑️")
            )
          ),
          a.createElement("div",{style:{marginTop:8,display:"flex",flexWrap:"wrap",gap:4}},
            (tmpl.items||[]).slice(0,5).map((item,i)=>a.createElement("span",{key:i,style:{fontSize:11,padding:"2px 8px",background:"rgba(255,255,255,.06)",borderRadius:99,color:"#94a3b8"}},item.label||item)),
            (tmpl.items||[]).length>5&&a.createElement("span",{style:{fontSize:11,color:"#475569"}},"+"+((tmpl.items||[]).length-5)+" more")
          )
        ))
      ),

      !loading&&tab==="active"&&a.createElement("div",null,
        a.createElement("div",{style:{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}},
          a.createElement("input",{style:{...inp,maxWidth:260},placeholder:"Search...",value:search,onChange:ev=>setSearch(ev.target.value)}),
          a.createElement("select",{style:{...inp,maxWidth:180},value:filterStatus,onChange:ev=>setFilterStatus(ev.target.value)},
            a.createElement("option",{value:""},"All statuses"),
            a.createElement("option",{value:"not_started"},"Not started"),
            a.createElement("option",{value:"in_progress"},"In progress"),
            a.createElement("option",{value:"completed"},"Completed")
          ),
          a.createElement("button",{style:{...btn,color:"#22c55e",borderColor:"rgba(34,197,94,.3)"},onClick:()=>openAttach("")},"+ Attach to job")
        ),
        !filteredActive.length&&a.createElement("div",{style:{...card,textAlign:"center",padding:40,color:"#475569"}},
          a.createElement("div",{style:{fontSize:40,marginBottom:12}},"✅"),
          a.createElement("div",{style:{fontWeight:600,marginBottom:6}},"No active checklists"),
          a.createElement("button",{style:{...btnPr,marginTop:12},onClick:()=>openAttach("")},"+ Attach a checklist")
        ),
        filteredActive.map(ac=>a.createElement("div",{key:ac.id,style:card},
          a.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}},
            a.createElement("div",{style:{flex:1}},
              a.createElement("div",{style:{fontWeight:700,color:"#f1f5f9",fontSize:14,marginBottom:2}},ac.template_name||"Checklist"),
              a.createElement("div",{style:{fontSize:12,color:"#64748b"}},(ac.job_title||"No job")+(ac.client_name?" · "+ac.client_name:"")),
              a.createElement("div",{style:{display:"flex",alignItems:"center",gap:8,marginTop:8}},
                a.createElement("div",{style:{flex:1,height:5,background:"rgba(255,255,255,.08)",borderRadius:3,overflow:"hidden"}},
                  a.createElement("div",{style:{height:"100%",background:(ac.items||[]).filter(i=>i.checked).length===(ac.items||[]).length&&(ac.items||[]).length>0?"#22c55e":"#3b82f6",width:(ac.items||[]).length?Math.round((ac.items||[]).filter(i=>i.checked).length/(ac.items||[]).length*100)+"%":"0%",transition:"width .3s"}})
                ),
                a.createElement("span",{style:{fontSize:11,color:"#64748b",whiteSpace:"nowrap"}},(ac.items||[]).filter(i=>i.checked).length+"/"+(ac.items||[]).length),
                a.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:99,background:"rgba(255,255,255,.06)",color:sColor[ac.status]||"#64748b",fontWeight:600}},sLabel[ac.status]||ac.status)
              )
            ),
            a.createElement("div",{style:{display:"flex",gap:5,flexShrink:0}},
              a.createElement("button",{style:btnPr,onClick:()=>openDetail(ac)},"📝 Fill out"),
              a.createElement("button",{style:btnRd,onClick:()=>deleteActive(ac.id)},"🗑️")
            )
          )
        ))
      )
    ),

    showTmpl&&a.createElement("div",{style:ov,onClick:ev=>{if(ev.target===ev.currentTarget)setShowTmpl(false);}},
      a.createElement("div",{style:modal},
        a.createElement("div",{style:mh},
          a.createElement("h2",{style:{margin:0,fontSize:18,fontWeight:700,color:"#f1f5f9"}},editId?"Edit Template":"New Template"),
          a.createElement("button",{style:{background:"none",border:"none",color:"#64748b",fontSize:22,cursor:"pointer"},onClick:()=>setShowTmpl(false)},"×")
        ),
        a.createElement("div",{style:mb},
          a.createElement("div",null,a.createElement("label",{style:lbl},"Template name *"),a.createElement("input",{style:inp,placeholder:"e.g. Lawn Mow Quality Check",value:tmplName,onChange:ev=>setTmplName(ev.target.value),autoFocus:true})),
          a.createElement("div",null,a.createElement("label",{style:lbl},"Division"),
            a.createElement("select",{style:{...inp,appearance:"auto"},value:tmplDiv,onChange:ev=>setTmplDiv(ev.target.value)},
              a.createElement("option",{value:""},"All divisions"),
              ["Lawn & Tree","Irrigation","Extermination","Nursery","Farm","Hardscape"].map(d=>a.createElement("option",{key:d,value:d},d))
            )
          ),
          a.createElement("div",null,a.createElement("label",{style:lbl},"Description"),a.createElement("input",{style:inp,placeholder:"When to use this...",value:tmplDesc,onChange:ev=>setTmplDesc(ev.target.value)})),
          a.createElement("div",null,
            a.createElement("label",{style:lbl},"Checklist Items"),
            !tmplItems.length&&a.createElement("div",{style:{fontSize:12,color:"#475569",padding:"8px 0"}},"No items yet"),
            tmplItems.map((item,idx)=>a.createElement("div",{key:idx,style:{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.07)",borderRadius:7,marginBottom:4}},
              a.createElement("span",{style:{flex:1,fontSize:13,color:"#f1f5f9"}},item),
              a.createElement("button",{style:{background:"none",border:"none",color:"#f87171",cursor:"pointer",fontSize:18},onClick:()=>removeItem(idx)},"×")
            )),
            a.createElement("div",{style:{display:"flex",gap:6,marginTop:6}},
              a.createElement("input",{style:{...inp,flex:1},placeholder:"Add item...",value:newItem,onChange:ev=>setNewItem(ev.target.value),onKeyDown:ev=>{if(ev.key==="Enter"){addItem();ev.preventDefault();}}}),
              a.createElement("button",{style:{...btnPr,whiteSpace:"nowrap"},onClick:addItem},"Add")
            )
          )
        ),
        a.createElement("div",{style:mf},
          a.createElement("button",{style:btn,onClick:()=>setShowTmpl(false)},"Cancel"),
          a.createElement("button",{style:{...btnPr,opacity:saving?.7:1},onClick:saveTmpl,disabled:saving},saving?"Saving...":editId?"Save changes":"Save template")
        )
      )
    ),

    showAttach&&a.createElement("div",{style:ov,onClick:ev=>{if(ev.target===ev.currentTarget)setShowAttach(false);}},
      a.createElement("div",{style:{...modal,maxWidth:420}},
        a.createElement("div",{style:mh},
          a.createElement("h2",{style:{margin:0,fontSize:18,fontWeight:700,color:"#f1f5f9"}},"Attach to Job"),
          a.createElement("button",{style:{background:"none",border:"none",color:"#64748b",fontSize:22,cursor:"pointer"},onClick:()=>setShowAttach(false)},"×")
        ),
        a.createElement("div",{style:mb},
          a.createElement("div",null,a.createElement("label",{style:lbl},"Job *"),
            a.createElement("select",{style:{...inp,appearance:"auto"},value:attachJobId,onChange:ev=>setAttachJobId(ev.target.value)},
              a.createElement("option",{value:""},"Select job..."),
              jobs.map(j=>a.createElement("option",{key:j.id,value:j.id},(j.title||"Job #"+j.id)+(j.client_name?" — "+j.client_name:"")))
            )
          ),
          a.createElement("div",null,a.createElement("label",{style:lbl},"Template *"),
            a.createElement("select",{style:{...inp,appearance:"auto"},value:attachTmplId,onChange:ev=>setAttachTmplId(ev.target.value)},
              a.createElement("option",{value:""},"Select template..."),
              templates.map(t=>a.createElement("option",{key:t.id,value:t.id},t.name))
            )
          )
        ),
        a.createElement("div",{style:mf},
          a.createElement("button",{style:btn,onClick:()=>setShowAttach(false)},"Cancel"),
          a.createElement("button",{style:btnPr,onClick:saveAttach},"Attach")
        )
      )
    ),

    showDetail&&detailCk&&a.createElement("div",{style:ov,onClick:ev=>{if(ev.target===ev.currentTarget)setShowDetail(false);}},
      a.createElement("div",{style:modal},
        a.createElement("div",{style:mh},
          a.createElement("div",null,
            a.createElement("h2",{style:{margin:0,fontSize:18,fontWeight:700,color:"#f1f5f9"}},detailCk.template_name||"Checklist"),
            a.createElement("p",{style:{margin:"3px 0 0",fontSize:12,color:"#64748b"}},(detailCk.job_title||"")+(detailCk.client_name?" · "+detailCk.client_name:""))
          ),
          a.createElement("button",{style:{background:"none",border:"none",color:"#64748b",fontSize:22,cursor:"pointer"},onClick:()=>setShowDetail(false)},"×")
        ),
        a.createElement("div",{style:mb},
          a.createElement("div",{style:{fontSize:12,color:"#64748b",marginBottom:8}},detailItems.filter(i=>i.checked).length+" of "+detailItems.length+" completed"),
          detailItems.map((item,idx)=>a.createElement("label",{key:idx,style:{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.07)",borderRadius:8,marginBottom:6,cursor:"pointer"}},
            a.createElement("input",{type:"checkbox",checked:item.checked,onChange:()=>toggleItem(idx),style:{width:18,height:18,accentColor:"#22c55e",cursor:"pointer"}}),
            a.createElement("span",{style:{fontSize:13,color:item.checked?"#64748b":"#f1f5f9",textDecoration:item.checked?"line-through":"none"}},item.label||item)
          )),
          a.createElement("div",{style:{marginTop:8}},
            a.createElement("label",{style:lbl},"Notes"),
            a.createElement("textarea",{style:{...inp,height:70,resize:"vertical"},value:detailNotes,onChange:ev=>setDetailNotes(ev.target.value),placeholder:"Optional notes..."})
          )
        ),
        a.createElement("div",{style:mf},
          a.createElement("button",{style:btn,onClick:()=>setShowDetail(false)},"Close"),
          a.createElement("button",{style:{...btnPr,opacity:saving?.7:1},onClick:saveDetail,disabled:saving},saving?"Saving...":"Save progress")
        )
      )
    )
  );
}
export{ChecklistsPage as default};
