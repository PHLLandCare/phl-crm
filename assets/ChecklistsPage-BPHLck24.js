import{c as e,d as t,n}from"./index-Fix002.js";
var a=t(e(),1),sb=n;

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
        sb.from("jobs").select("id,title,client_name").order("created_at",{ascending:false}).limit(200)
      ]);
      setTemplates(tm.data||[]);setActive(ac.data||[]);setJobs(jb.data||[]);
    }catch(err){showToast("Error: "+err.message);}
    setLoading(false);
  }

  function openNew(){setEditId(null);setTmplName("");setTmplDiv("");setTmplItems([]);setNewItem("");setShowTmpl(true);}
  function openEdit(tmpl){setEditId(tmpl.id);setTmplName(tmpl.name||"");setTmplDiv(tmpl.division||"");setTmplItems((tmpl.items||[]).map(i=>i.label||i));setNewItem("");setShowTmpl(true);}
  function addItem(){var v=newItem.trim();if(!v)return;setTmplItems(p=>[...p,v]);setNewItem("");}
  function removeItem(i){setTmplItems(p=>p.filter((_,j)=>j!==i));}

  async function saveTmpl(){
    if(!tmplName.trim()){showToast("Enter a name");return;}
    if(!tmplItems.length){showToast("Add at least one item");return;}
    setSaving(true);
    var payload={name:tmplName.trim(),division:tmplDiv,items:tmplItems.map(l=>({label:l,checked:false}))};
    try{
      editId?await sb.from("checklist_templates").update(payload).eq("id",editId):await sb.from("checklist_templates").insert(payload);
      showToast(editId?"Updated!":"Created!");setShowTmpl(false);loadAll();
    }catch(err){showToast("Error: "+err.message);}
    setSaving(false);
  }

  async function deleteTmpl(id){if(!confirm("Delete template?"))return;await sb.from("checklist_templates").delete().eq("id",id);showToast("Deleted");loadAll();}

  function openAttach(tid){setAttachTmplId(String(tid||""));setAttachJobId("");setShowAttach(true);}

  async function saveAttach(){
    if(!attachJobId){showToast("Select a job");return;}
    if(!attachTmplId){showToast("Select a template");return;}
    var tmpl=templates.find(t=>String(t.id)===String(attachTmplId));
    var job=jobs.find(j=>String(j.id)===String(attachJobId));
    if(!tmpl)return;
    try{
      await sb.from("job_checklists").insert({job_id:parseInt(attachJobId),job_title:job?job.title:"",client_name:job?job.client_name:"",template_id:parseInt(attachTmplId),template_name:tmpl.name,items:(tmpl.items||[]).map(i=>({label:i.label||i,checked:false})),status:"not_started",notes:""});
      showToast("Attached!");setShowAttach(false);loadAll();
    }catch(err){showToast("Error: "+err.message);}
  }

  function openDetail(ck){setDetailCk(ck);setDetailItems(JSON.parse(JSON.stringify(ck.items||[])));setDetailNotes(ck.notes||"");setShowDetail(true);}
  function toggleItem(i){setDetailItems(p=>p.map((x,j)=>j===i?{...x,checked:!x.checked}:x));}

  async function saveDetail(){
    if(!detailCk)return;setSaving(true);
    var done=detailItems.filter(i=>i.checked).length;
    var status=done===0?"not_started":done===detailItems.length?"completed":"in_progress";
    try{await sb.from("job_checklists").update({items:detailItems,status,notes:detailNotes}).eq("id",detailCk.id);showToast("Saved!");setShowDetail(false);loadAll();}
    catch(err){showToast("Error: "+err.message);}
    setSaving(false);
  }

  async function deleteActive(id){if(!confirm("Remove?"))return;await sb.from("job_checklists").delete().eq("id",id);showToast("Removed");loadAll();}

  var filtered=active.filter(x=>{
    var mq=!search||(x.job_title||"").toLowerCase().includes(search.toLowerCase())||(x.client_name||"").toLowerCase().includes(search.toLowerCase())||(x.template_name||"").toLowerCase().includes(search.toLowerCase());
    return mq&&(!filterStatus||x.status===filterStatus);
  });

  // Styles
  var card={background:"#0f172a",border:"1px solid #1e293b",borderRadius:12,padding:16,marginBottom:10};
  var btn={padding:"8px 14px",border:"1px solid #1e293b",borderRadius:8,background:"rgba(255,255,255,.05)",color:"#f1f5f9",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"inherit"};
  var btnG={...btn,background:"#16a34a",border:"none"};
  var btnR={...btn,color:"#f87171",borderColor:"rgba(248,113,113,.3)"};
  var inp={padding:"10px 12px",background:"#1a2332",border:"1px solid #2d3f55",borderRadius:8,fontSize:13,color:"#f1f5f9",fontFamily:"inherit",outline:"none",width:"100%",boxSizing:"border-box"};
  var lbl={fontSize:11,fontWeight:700,color:"#64748b",display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"};
  var ov={position:"fixed",inset:0,background:"rgba(0,0,0,.7)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16};
  var mo={background:"#0f172a",border:"1px solid #1e293b",borderRadius:16,width:"100%",maxWidth:520,maxHeight:"90vh",overflow:"auto"};
  var mh_s={display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 22px 14px",borderBottom:"1px solid #1e293b"};
  var mb_s={padding:"18px 22px",display:"flex",flexDirection:"column",gap:12};
  var mf_s={display:"flex",gap:8,justifyContent:"flex-end",padding:"14px 22px",borderTop:"1px solid #1e293b"};
  var sC={not_started:"#64748b",in_progress:"#f59e0b",completed:"#22c55e"};
  var sL={not_started:"Not started",in_progress:"In progress",completed:"Completed"};

  return e.createElement(e.Fragment,null,
    toast&&e.createElement("div",{style:{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#0f172a",color:"#fff",padding:"12px 22px",borderRadius:10,fontSize:13,fontWeight:600,borderLeft:"4px solid #22c55e",zIndex:9999,boxShadow:"0 6px 24px rgba(0,0,0,.5)",whiteSpace:"nowrap"}},toast),

    e.createElement("div",{style:{padding:"0 2rem 2rem",maxWidth:1100,margin:"0 auto"}},
      e.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"1.5rem",flexWrap:"wrap",gap:12}},
        e.createElement("div",null,
          e.createElement("h1",{style:{margin:0,fontSize:24,fontWeight:700,color:"#f1f5f9"}},"Checklists"),
          e.createElement("p",{style:{margin:"4px 0 0",fontSize:13,color:"#64748b"}},"Job quality checklists and inspection templates")
        ),
        e.createElement("button",{style:btnG,onClick:openNew},"+ New template")
      ),

      e.createElement("div",{style:{display:"flex",gap:6,marginBottom:20}},
        ["templates","active"].map(id=>e.createElement("button",{key:id,style:{...btn,...(tab===id?{background:"rgba(34,197,94,.15)",borderColor:"#22c55e",color:"#4ade80"}:{})},onClick:()=>setTab(id)},id==="templates"?"📋 Templates ("+templates.length+")":"✅ Active ("+active.length+")"))
      ),

      loading&&e.createElement("div",{style:{textAlign:"center",padding:"3rem",color:"#64748b"}},"Loading..."),

      !loading&&tab==="templates"&&e.createElement("div",null,
        !templates.length&&e.createElement("div",{style:{...card,textAlign:"center",padding:40,color:"#475569"}},
          e.createElement("div",{style:{fontSize:36,marginBottom:10}},"📋"),
          e.createElement("div",{style:{fontWeight:600,marginBottom:12}},"No templates yet"),
          e.createElement("button",{style:btnG,onClick:openNew},"+ Create first template")
        ),
        templates.map(tmpl=>e.createElement("div",{key:tmpl.id,style:card},
          e.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}},
            e.createElement("div",{style:{flex:1}},
              e.createElement("div",{style:{fontWeight:700,color:"#f1f5f9",fontSize:15,marginBottom:3}},tmpl.name),
              e.createElement("div",{style:{fontSize:12,color:"#64748b"}},(tmpl.division||"All divisions")+" · "+(tmpl.items||[]).length+" items")
            ),
            e.createElement("div",{style:{display:"flex",gap:5,flexShrink:0,flexWrap:"wrap"}},
              e.createElement("button",{style:{...btn,color:"#22c55e",borderColor:"rgba(34,197,94,.3)"},onClick:()=>openAttach(tmpl.id)},"🔗 Attach"),
              e.createElement("button",{style:btn,onClick:()=>openEdit(tmpl)},"✏️ Edit"),
              e.createElement("button",{style:btnR,onClick:()=>deleteTmpl(tmpl.id)},"🗑️")
            )
          ),
          e.createElement("div",{style:{marginTop:8,display:"flex",flexWrap:"wrap",gap:4}},
            (tmpl.items||[]).slice(0,5).map((item,i)=>e.createElement("span",{key:i,style:{fontSize:11,padding:"2px 8px",background:"rgba(255,255,255,.06)",borderRadius:99,color:"#94a3b8"}},item.label||item)),
            (tmpl.items||[]).length>5&&e.createElement("span",{style:{fontSize:11,color:"#475569"}},"+"+((tmpl.items||[]).length-5)+" more")
          )
        ))
      ),

      !loading&&tab==="active"&&e.createElement("div",null,
        e.createElement("div",{style:{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}},
          e.createElement("input",{style:{...inp,maxWidth:260},placeholder:"Search...",value:search,onChange:ev=>setSearch(ev.target.value)}),
          e.createElement("select",{style:{...inp,maxWidth:160},value:filterStatus,onChange:ev=>setFilterStatus(ev.target.value)},
            e.createElement("option",{value:""},"All statuses"),
            e.createElement("option",{value:"not_started"},"Not started"),
            e.createElement("option",{value:"in_progress"},"In progress"),
            e.createElement("option",{value:"completed"},"Completed")
          ),
          e.createElement("button",{style:{...btn,color:"#22c55e",borderColor:"rgba(34,197,94,.3)"},onClick:()=>openAttach("")},"+ Attach to job")
        ),
        !filtered.length&&e.createElement("div",{style:{...card,textAlign:"center",padding:40,color:"#475569"}},
          e.createElement("div",{style:{fontSize:36,marginBottom:10}},"✅"),
          e.createElement("div",{style:{fontWeight:600,marginBottom:12}},"No active checklists"),
          e.createElement("button",{style:btnG,onClick:()=>openAttach("")},"+ Attach a checklist")
        ),
        filtered.map(ac=>e.createElement("div",{key:ac.id,style:card},
          e.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}},
            e.createElement("div",{style:{flex:1}},
              e.createElement("div",{style:{fontWeight:700,color:"#f1f5f9",fontSize:14,marginBottom:2}},ac.template_name||"Checklist"),
              e.createElement("div",{style:{fontSize:12,color:"#64748b"}},(ac.job_title||"No job")+(ac.client_name?" · "+ac.client_name:"")),
              e.createElement("div",{style:{display:"flex",alignItems:"center",gap:8,marginTop:8}},
                e.createElement("div",{style:{flex:1,height:5,background:"rgba(255,255,255,.08)",borderRadius:3,overflow:"hidden"}},
                  e.createElement("div",{style:{height:"100%",background:(ac.items||[]).filter(i=>i.checked).length===(ac.items||[]).length&&(ac.items||[]).length>0?"#22c55e":"#3b82f6",width:(ac.items||[]).length?Math.round((ac.items||[]).filter(i=>i.checked).length/(ac.items||[]).length*100)+"%":"0%",transition:"width .3s"}})
                ),
                e.createElement("span",{style:{fontSize:11,color:"#64748b"}},(ac.items||[]).filter(i=>i.checked).length+"/"+(ac.items||[]).length),
                e.createElement("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:99,background:"rgba(255,255,255,.06)",color:sC[ac.status]||"#64748b",fontWeight:600}},sL[ac.status]||ac.status)
              )
            ),
            e.createElement("div",{style:{display:"flex",gap:5,flexShrink:0}},
              e.createElement("button",{style:btnG,onClick:()=>openDetail(ac)},"📝 Fill out"),
              e.createElement("button",{style:btnR,onClick:()=>deleteActive(ac.id)},"🗑️")
            )
          )
        ))
      )
    ),

    showTmpl&&e.createElement("div",{style:ov,onClick:ev=>{if(ev.target===ev.currentTarget)setShowTmpl(false);}},
      e.createElement("div",{style:mo},
        e.createElement("div",{style:mh_s},
          e.createElement("h2",{style:{margin:0,fontSize:17,fontWeight:700,color:"#f1f5f9"}},editId?"Edit Template":"New Template"),
          e.createElement("button",{style:{background:"none",border:"none",color:"#64748b",fontSize:22,cursor:"pointer"},onClick:()=>setShowTmpl(false)},"×")
        ),
        e.createElement("div",{style:mb_s},
          e.createElement("div",null,e.createElement("label",{style:lbl},"Template name *"),e.createElement("input",{style:inp,placeholder:"e.g. Lawn Mow Quality Check",value:tmplName,onChange:ev=>setTmplName(ev.target.value),autoFocus:true})),
          e.createElement("div",null,e.createElement("label",{style:lbl},"Division"),
            e.createElement("select",{style:{...inp,appearance:"auto"},value:tmplDiv,onChange:ev=>setTmplDiv(ev.target.value)},
              e.createElement("option",{value:""},"All divisions"),
              ["Lawn & Tree","Irrigation","Extermination","Nursery","Farm","Hardscape"].map(d=>e.createElement("option",{key:d,value:d},d))
            )
          ),
          e.createElement("div",null,
            e.createElement("label",{style:lbl},"Items"),
            !tmplItems.length&&e.createElement("div",{style:{fontSize:12,color:"#475569",padding:"6px 0"}},"No items yet"),
            tmplItems.map((item,idx)=>e.createElement("div",{key:idx,style:{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.07)",borderRadius:7,marginBottom:4}},
              e.createElement("span",{style:{flex:1,fontSize:13,color:"#f1f5f9"}},item),
              e.createElement("button",{style:{background:"none",border:"none",color:"#f87171",cursor:"pointer",fontSize:18},onClick:()=>removeItem(idx)},"×")
            )),
            e.createElement("div",{style:{display:"flex",gap:6,marginTop:6}},
              e.createElement("input",{style:{...inp,flex:1},placeholder:"Add item...",value:newItem,onChange:ev=>setNewItem(ev.target.value),onKeyDown:ev=>{if(ev.key==="Enter"){addItem();ev.preventDefault();}}}),
              e.createElement("button",{style:{...btnG,whiteSpace:"nowrap"},onClick:addItem},"Add")
            )
          )
        ),
        e.createElement("div",{style:mf_s},
          e.createElement("button",{style:btn,onClick:()=>setShowTmpl(false)},"Cancel"),
          e.createElement("button",{style:{...btnG,opacity:saving?.7:1},onClick:saveTmpl,disabled:saving},saving?"Saving...":editId?"Save changes":"Save template")
        )
      )
    ),

    showAttach&&e.createElement("div",{style:ov,onClick:ev=>{if(ev.target===ev.currentTarget)setShowAttach(false);}},
      e.createElement("div",{style:{...mo,maxWidth:420}},
        e.createElement("div",{style:mh_s},
          e.createElement("h2",{style:{margin:0,fontSize:17,fontWeight:700,color:"#f1f5f9"}},"Attach to Job"),
          e.createElement("button",{style:{background:"none",border:"none",color:"#64748b",fontSize:22,cursor:"pointer"},onClick:()=>setShowAttach(false)},"×")
        ),
        e.createElement("div",{style:mb_s},
          e.createElement("div",null,e.createElement("label",{style:lbl},"Job *"),
            e.createElement("select",{style:{...inp,appearance:"auto"},value:attachJobId,onChange:ev=>setAttachJobId(ev.target.value)},
              e.createElement("option",{value:""},"Select job..."),
              jobs.map(j=>e.createElement("option",{key:j.id,value:j.id},(j.title||"Job #"+j.id)+(j.client_name?" — "+j.client_name:"")))
            )
          ),
          e.createElement("div",null,e.createElement("label",{style:lbl},"Template *"),
            e.createElement("select",{style:{...inp,appearance:"auto"},value:attachTmplId,onChange:ev=>setAttachTmplId(ev.target.value)},
              e.createElement("option",{value:""},"Select template..."),
              templates.map(t=>e.createElement("option",{key:t.id,value:t.id},t.name))
            )
          )
        ),
        e.createElement("div",{style:mf_s},
          e.createElement("button",{style:btn,onClick:()=>setShowAttach(false)},"Cancel"),
          e.createElement("button",{style:btnG,onClick:saveAttach},"Attach")
        )
      )
    ),

    showDetail&&detailCk&&e.createElement("div",{style:ov,onClick:ev=>{if(ev.target===ev.currentTarget)setShowDetail(false);}},
      e.createElement("div",{style:mo},
        e.createElement("div",{style:mh_s},
          e.createElement("div",null,
            e.createElement("h2",{style:{margin:0,fontSize:17,fontWeight:700,color:"#f1f5f9"}},detailCk.template_name||"Checklist"),
            e.createElement("p",{style:{margin:"3px 0 0",fontSize:12,color:"#64748b"}},(detailCk.job_title||"")+(detailCk.client_name?" · "+detailCk.client_name:""))
          ),
          e.createElement("button",{style:{background:"none",border:"none",color:"#64748b",fontSize:22,cursor:"pointer"},onClick:()=>setShowDetail(false)},"×")
        ),
        e.createElement("div",{style:mb_s},
          e.createElement("div",{style:{fontSize:12,color:"#64748b",marginBottom:6}},detailItems.filter(i=>i.checked).length+" of "+detailItems.length+" completed"),
          detailItems.map((item,idx)=>e.createElement("label",{key:idx,style:{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.07)",borderRadius:8,marginBottom:5,cursor:"pointer"}},
            e.createElement("input",{type:"checkbox",checked:item.checked,onChange:()=>toggleItem(idx),style:{width:18,height:18,accentColor:"#22c55e",cursor:"pointer"}}),
            e.createElement("span",{style:{fontSize:13,color:item.checked?"#64748b":"#f1f5f9",textDecoration:item.checked?"line-through":"none"}},item.label||item)
          )),
          e.createElement("div",{style:{marginTop:10}},
            e.createElement("label",{style:lbl},"Notes"),
            e.createElement("textarea",{style:{...inp,height:70,resize:"vertical"},value:detailNotes,onChange:ev=>setDetailNotes(ev.target.value),placeholder:"Optional notes..."})
          )
        ),
        e.createElement("div",{style:mf_s},
          e.createElement("button",{style:btn,onClick:()=>setShowDetail(false)},"Close"),
          e.createElement("button",{style:{...btnG,opacity:saving?.7:1},onClick:saveDetail,disabled:saving},saving?"Saving...":"Save progress")
        )
      )
    )
  );
}
export{ChecklistsPage as default};
