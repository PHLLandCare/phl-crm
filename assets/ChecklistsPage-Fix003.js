import{c as e,d as t,n,o as r,t as i}from"./index-DqsKYlwG.js";var a=t(e(),1),o=i();

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
        n.from("checklist_templates").select("*").order("created_at",{ascending:false}),
        n.from("job_checklists").select("*").order("created_at",{ascending:false}),
        n.from("jobs").select("id,title,client_name").order("created_at",{ascending:false}).limit(200)
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
      editId?await n.from("checklist_templates").update(payload).eq("id",editId):await n.from("checklist_templates").insert(payload);
      showToast(editId?"Updated!":"Created!");setShowTmpl(false);loadAll();
    }catch(err){showToast("Error: "+err.message);}
    setSaving(false);
  }

  async function deleteTmpl(id){if(!confirm("Delete template?"))return;await n.from("checklist_templates").delete().eq("id",id);showToast("Deleted");loadAll();}

  function openAttach(tid){setAttachTmplId(String(tid||""));setAttachJobId("");setShowAttach(true);}

  async function saveAttach(){
    if(!attachJobId){showToast("Select a job");return;}
    if(!attachTmplId){showToast("Select a template");return;}
    var tmpl=templates.find(t=>String(t.id)===String(attachTmplId));
    var job=jobs.find(j=>String(j.id)===String(attachJobId));
    if(!tmpl)return;
    try{
      await n.from("job_checklists").insert({job_id:parseInt(attachJobId),job_title:job?job.title:"",client_name:job?job.client_name:"",template_id:parseInt(attachTmplId),template_name:tmpl.name,items:(tmpl.items||[]).map(i=>({label:i.label||i,checked:false})),status:"not_started",notes:""});
      showToast("Attached!");setShowAttach(false);loadAll();
    }catch(err){showToast("Error: "+err.message);}
  }

  function openDetail(ck){setDetailCk(ck);setDetailItems(JSON.parse(JSON.stringify(ck.items||[])));setDetailNotes(ck.notes||"");setShowDetail(true);}
  function toggleItem(i){setDetailItems(p=>p.map((x,j)=>j===i?{...x,checked:!x.checked}:x));}

  async function saveDetail(){
    if(!detailCk)return;setSaving(true);
    var done=detailItems.filter(i=>i.checked).length;
    var status=done===0?"not_started":done===detailItems.length?"completed":"in_progress";
    try{await n.from("job_checklists").update({items:detailItems,status,notes:detailNotes}).eq("id",detailCk.id);showToast("Saved!");setShowDetail(false);loadAll();}
    catch(err){showToast("Error: "+err.message);}
    setSaving(false);
  }

  async function deleteActive(id){if(!confirm("Remove?"))return;await n.from("job_checklists").delete().eq("id",id);showToast("Removed");loadAll();}

  var filtered=active.filter(x=>{
    var mq=!search||(x.job_title||"").toLowerCase().includes(search.toLowerCase())||(x.client_name||"").toLowerCase().includes(search.toLowerCase())||(x.template_name||"").toLowerCase().includes(search.toLowerCase());
    return mq&&(!filterStatus||x.status===filterStatus);
  });

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

  return(0,o.jsxs)(a.Fragment,{children:[
    toast&&(0,o.jsx)("div",{style:{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#0f172a",color:"#fff",padding:"12px 22px",borderRadius:10,fontSize:13,fontWeight:600,borderLeft:"4px solid #22c55e",zIndex:9999,boxShadow:"0 6px 24px rgba(0,0,0,.5)",whiteSpace:"nowrap"},children:toast}),

    (0,o.jsxs)("div",{style:{padding:"0 2rem 2rem",maxWidth:1100,margin:"0 auto"},children:[
      (0,o.jsxs)("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"1.5rem",flexWrap:"wrap",gap:12},children:[
        (0,o.jsxs)("div",{children:[
          (0,o.jsx)("h1",{style:{margin:0,fontSize:24,fontWeight:700,color:"#f1f5f9"},children:"Checklists"}),
          (0,o.jsx)("p",{style:{margin:"4px 0 0",fontSize:13,color:"#64748b"},children:"Job quality checklists and inspection templates"})
        ]}),
        (0,o.jsx)("button",{style:btnG,onClick:openNew,children:"+ New template"})
      ]}),

      (0,o.jsx)("div",{style:{display:"flex",gap:6,marginBottom:20},children:
        ["templates","active"].map(id=>(0,o.jsx)("button",{style:{...btn,...(tab===id?{background:"rgba(34,197,94,.15)",borderColor:"#22c55e",color:"#4ade80"}:{})},onClick:()=>setTab(id),children:id==="templates"?"📋 Templates ("+templates.length+")":"✅ Active ("+active.length+")"},id))
      }),

      loading&&(0,o.jsx)("div",{style:{textAlign:"center",padding:"3rem",color:"#64748b"},children:"Loading..."}),

      !loading&&tab==="templates"&&(0,o.jsxs)("div",{children:[
        !templates.length&&(0,o.jsxs)("div",{style:{...card,textAlign:"center",padding:40,color:"#475569"},children:[
          (0,o.jsx)("div",{style:{fontSize:36,marginBottom:10},children:"📋"}),
          (0,o.jsx)("div",{style:{fontWeight:600,marginBottom:12},children:"No templates yet"}),
          (0,o.jsx)("button",{style:btnG,onClick:openNew,children:"+ Create first template"})
        ]}),
        templates.map(tmpl=>(0,o.jsxs)("div",{style:card,children:[
          (0,o.jsxs)("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12},children:[
            (0,o.jsxs)("div",{style:{flex:1},children:[
              (0,o.jsx)("div",{style:{fontWeight:700,color:"#f1f5f9",fontSize:15,marginBottom:3},children:tmpl.name}),
              (0,o.jsx)("div",{style:{fontSize:12,color:"#64748b"},children:(tmpl.division||"All divisions")+" · "+(tmpl.items||[]).length+" items"})
            ]}),
            (0,o.jsxs)("div",{style:{display:"flex",gap:5,flexShrink:0,flexWrap:"wrap"},children:[
              (0,o.jsx)("button",{style:{...btn,color:"#22c55e",borderColor:"rgba(34,197,94,.3)"},onClick:()=>openAttach(tmpl.id),children:"🔗 Attach"}),
              (0,o.jsx)("button",{style:btn,onClick:()=>openEdit(tmpl),children:"✏️ Edit"}),
              (0,o.jsx)("button",{style:btnR,onClick:()=>deleteTmpl(tmpl.id),children:"🗑️"})
            ]})
          ]}),
          (0,o.jsx)("div",{style:{marginTop:8,display:"flex",flexWrap:"wrap",gap:4},children:[
            ...(tmpl.items||[]).slice(0,5).map((item,i)=>(0,o.jsx)("span",{style:{fontSize:11,padding:"2px 8px",background:"rgba(255,255,255,.06)",borderRadius:99,color:"#94a3b8"},children:item.label||item},i)),
            (tmpl.items||[]).length>5&&(0,o.jsx)("span",{style:{fontSize:11,color:"#475569"},children:"+"+((tmpl.items||[]).length-5)+" more"})
          ]})
        ]},tmpl.id))
      ]}),

      !loading&&tab==="active"&&(0,o.jsxs)("div",{children:[
        (0,o.jsxs)("div",{style:{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"},children:[
          (0,o.jsx)("input",{style:{...inp,maxWidth:260},placeholder:"Search...",value:search,onChange:ev=>setSearch(ev.target.value)}),
          (0,o.jsxs)("select",{style:{...inp,maxWidth:160},value:filterStatus,onChange:ev=>setFilterStatus(ev.target.value),children:[
            (0,o.jsx)("option",{value:"",children:"All statuses"}),
            (0,o.jsx)("option",{value:"not_started",children:"Not started"}),
            (0,o.jsx)("option",{value:"in_progress",children:"In progress"}),
            (0,o.jsx)("option",{value:"completed",children:"Completed"})
          ]}),
          (0,o.jsx)("button",{style:{...btn,color:"#22c55e",borderColor:"rgba(34,197,94,.3)"},onClick:()=>openAttach(""),children:"+ Attach to job"})
        ]}),
        !filtered.length&&(0,o.jsxs)("div",{style:{...card,textAlign:"center",padding:40,color:"#475569"},children:[
          (0,o.jsx)("div",{style:{fontSize:36,marginBottom:10},children:"✅"}),
          (0,o.jsx)("div",{style:{fontWeight:600,marginBottom:12},children:"No active checklists"}),
          (0,o.jsx)("button",{style:btnG,onClick:()=>openAttach(""),children:"+ Attach a checklist"})
        ]}),
        filtered.map(ac=>(0,o.jsxs)("div",{style:card,children:[
          (0,o.jsxs)("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12},children:[
            (0,o.jsxs)("div",{style:{flex:1},children:[
              (0,o.jsx)("div",{style:{fontWeight:700,color:"#f1f5f9",fontSize:14,marginBottom:2},children:ac.template_name||"Checklist"}),
              (0,o.jsx)("div",{style:{fontSize:12,color:"#64748b"},children:(ac.job_title||"No job")+(ac.client_name?" · "+ac.client_name:"")}),
              (0,o.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:8,marginTop:8},children:[
                (0,o.jsx)("div",{style:{flex:1,height:5,background:"rgba(255,255,255,.08)",borderRadius:3,overflow:"hidden"},children:
                  (0,o.jsx)("div",{style:{height:"100%",background:(ac.items||[]).filter(i=>i.checked).length===(ac.items||[]).length&&(ac.items||[]).length>0?"#22c55e":"#3b82f6",width:(ac.items||[]).length?Math.round((ac.items||[]).filter(i=>i.checked).length/(ac.items||[]).length*100)+"%":"0%",transition:"width .3s"}})
                }),
                (0,o.jsx)("span",{style:{fontSize:11,color:"#64748b"},children:(ac.items||[]).filter(i=>i.checked).length+"/"+(ac.items||[]).length}),
                (0,o.jsx)("span",{style:{fontSize:10,padding:"2px 8px",borderRadius:99,background:"rgba(255,255,255,.06)",color:sC[ac.status]||"#64748b",fontWeight:600},children:sL[ac.status]||ac.status})
              ]})
            ]}),
            (0,o.jsxs)("div",{style:{display:"flex",gap:5,flexShrink:0},children:[
              (0,o.jsx)("button",{style:btnG,onClick:()=>openDetail(ac),children:"📝 Fill out"}),
              (0,o.jsx)("button",{style:btnR,onClick:()=>deleteActive(ac.id),children:"🗑️"})
            ]})
          ]})
        ]},ac.id))
      ]})
    ]}),

    showTmpl&&(0,o.jsx)("div",{style:ov,onClick:ev=>{if(ev.target===ev.currentTarget)setShowTmpl(false);},children:
      (0,o.jsxs)("div",{style:mo,children:[
        (0,o.jsxs)("div",{style:mh_s,children:[
          (0,o.jsx)("h2",{style:{margin:0,fontSize:17,fontWeight:700,color:"#f1f5f9"},children:editId?"Edit Template":"New Template"}),
          (0,o.jsx)("button",{style:{background:"none",border:"none",color:"#64748b",fontSize:22,cursor:"pointer"},onClick:()=>setShowTmpl(false),children:"×"})
        ]}),
        (0,o.jsxs)("div",{style:mb_s,children:[
          (0,o.jsxs)("div",{children:[
            (0,o.jsx)("label",{style:lbl,children:"Template name *"}),
            (0,o.jsx)("input",{style:inp,placeholder:"e.g. Lawn Mow Quality Check",value:tmplName,onChange:ev=>setTmplName(ev.target.value),autoFocus:true})
          ]}),
          (0,o.jsxs)("div",{children:[
            (0,o.jsx)("label",{style:lbl,children:"Division"}),
            (0,o.jsxs)("select",{style:{...inp,appearance:"auto"},value:tmplDiv,onChange:ev=>setTmplDiv(ev.target.value),children:[
              (0,o.jsx)("option",{value:"",children:"All divisions"}),
              ["Lawn & Tree","Irrigation","Extermination","Nursery","Farm","Hardscape"].map(d=>(0,o.jsx)("option",{value:d,children:d},d))
            ]})
          ]}),
          (0,o.jsxs)("div",{children:[
            (0,o.jsx)("label",{style:lbl,children:"Items"}),
            !tmplItems.length&&(0,o.jsx)("div",{style:{fontSize:12,color:"#475569",padding:"6px 0"},children:"No items yet"}),
            tmplItems.map((item,idx)=>(0,o.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.07)",borderRadius:7,marginBottom:4},children:[
              (0,o.jsx)("span",{style:{flex:1,fontSize:13,color:"#f1f5f9"},children:item}),
              (0,o.jsx)("button",{style:{background:"none",border:"none",color:"#f87171",cursor:"pointer",fontSize:18},onClick:()=>removeItem(idx),children:"×"})
            ]},idx)),
            (0,o.jsxs)("div",{style:{display:"flex",gap:6,marginTop:6},children:[
              (0,o.jsx)("input",{style:{...inp,flex:1},placeholder:"Add item...",value:newItem,onChange:ev=>setNewItem(ev.target.value),onKeyDown:ev=>{if(ev.key==="Enter"){addItem();ev.preventDefault();}}}),
              (0,o.jsx)("button",{style:{...btnG,whiteSpace:"nowrap"},onClick:addItem,children:"Add"})
            ]})
          ]})
        ]}),
        (0,o.jsxs)("div",{style:mf_s,children:[
          (0,o.jsx)("button",{style:btn,onClick:()=>setShowTmpl(false),children:"Cancel"}),
          (0,o.jsx)("button",{style:{...btnG,opacity:saving?.7:1},onClick:saveTmpl,disabled:saving,children:saving?"Saving...":editId?"Save changes":"Save template"})
        ]})
      ]})
    }),

    showAttach&&(0,o.jsx)("div",{style:ov,onClick:ev=>{if(ev.target===ev.currentTarget)setShowAttach(false);},children:
      (0,o.jsxs)("div",{style:{...mo,maxWidth:420},children:[
        (0,o.jsxs)("div",{style:mh_s,children:[
          (0,o.jsx)("h2",{style:{margin:0,fontSize:17,fontWeight:700,color:"#f1f5f9"},children:"Attach to Job"}),
          (0,o.jsx)("button",{style:{background:"none",border:"none",color:"#64748b",fontSize:22,cursor:"pointer"},onClick:()=>setShowAttach(false),children:"×"})
        ]}),
        (0,o.jsxs)("div",{style:mb_s,children:[
          (0,o.jsxs)("div",{children:[
            (0,o.jsx)("label",{style:lbl,children:"Job *"}),
            (0,o.jsxs)("select",{style:{...inp,appearance:"auto"},value:attachJobId,onChange:ev=>setAttachJobId(ev.target.value),children:[
              (0,o.jsx)("option",{value:"",children:"Select job..."}),
              jobs.map(j=>(0,o.jsx)("option",{value:j.id,children:(j.title||"Job #"+j.id)+(j.client_name?" — "+j.client_name:"")},j.id))
            ]})
          ]}),
          (0,o.jsxs)("div",{children:[
            (0,o.jsx)("label",{style:lbl,children:"Template *"}),
            (0,o.jsxs)("select",{style:{...inp,appearance:"auto"},value:attachTmplId,onChange:ev=>setAttachTmplId(ev.target.value),children:[
              (0,o.jsx)("option",{value:"",children:"Select template..."}),
              templates.map(t=>(0,o.jsx)("option",{value:t.id,children:t.name},t.id))
            ]})
          ]})
        ]}),
        (0,o.jsxs)("div",{style:mf_s,children:[
          (0,o.jsx)("button",{style:btn,onClick:()=>setShowAttach(false),children:"Cancel"}),
          (0,o.jsx)("button",{style:btnG,onClick:saveAttach,children:"Attach"})
        ]})
      ]})
    }),

    showDetail&&detailCk&&(0,o.jsx)("div",{style:ov,onClick:ev=>{if(ev.target===ev.currentTarget)setShowDetail(false);},children:
      (0,o.jsxs)("div",{style:mo,children:[
        (0,o.jsxs)("div",{style:mh_s,children:[
          (0,o.jsxs)("div",{children:[
            (0,o.jsx)("h2",{style:{margin:0,fontSize:17,fontWeight:700,color:"#f1f5f9"},children:detailCk.template_name||"Checklist"}),
            (0,o.jsx)("p",{style:{margin:"3px 0 0",fontSize:12,color:"#64748b"},children:(detailCk.job_title||"")+(detailCk.client_name?" · "+detailCk.client_name:"")})
          ]}),
          (0,o.jsx)("button",{style:{background:"none",border:"none",color:"#64748b",fontSize:22,cursor:"pointer"},onClick:()=>setShowDetail(false),children:"×"})
        ]}),
        (0,o.jsxs)("div",{style:mb_s,children:[
          (0,o.jsx)("div",{style:{fontSize:12,color:"#64748b",marginBottom:6},children:detailItems.filter(i=>i.checked).length+" of "+detailItems.length+" completed"}),
          detailItems.map((item,idx)=>(0,o.jsxs)("label",{style:{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.07)",borderRadius:8,marginBottom:5,cursor:"pointer"},children:[
            (0,o.jsx)("input",{type:"checkbox",checked:item.checked,onChange:()=>toggleItem(idx),style:{width:18,height:18,accentColor:"#22c55e",cursor:"pointer"}}),
            (0,o.jsx)("span",{style:{fontSize:13,color:item.checked?"#64748b":"#f1f5f9",textDecoration:item.checked?"line-through":"none"},children:item.label||item})
          ]},idx)),
          (0,o.jsxs)("div",{style:{marginTop:10},children:[
            (0,o.jsx)("label",{style:lbl,children:"Notes"}),
            (0,o.jsx)("textarea",{style:{...inp,height:70,resize:"vertical"},value:detailNotes,onChange:ev=>setDetailNotes(ev.target.value),placeholder:"Optional notes..."})
          ]})
        ]}),
        (0,o.jsxs)("div",{style:mf_s,children:[
          (0,o.jsx)("button",{style:btn,onClick:()=>setShowDetail(false),children:"Close"}),
          (0,o.jsx)("button",{style:{...btnG,opacity:saving?.7:1},onClick:saveDetail,disabled:saving,children:saving?"Saving...":"Save progress"})
        ]})
      ]})
    })
  ]});
}
export{ChecklistsPage as default};
