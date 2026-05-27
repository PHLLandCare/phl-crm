import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Employee {
  id: string
  full_name: string
  role: string
}

export default function PayrollPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadEmployees = async () => {
      setLoading(true)
      const { data } = await supabase
        .from('user_profiles')
        .select('id, full_name, role')
        .is('deleted_at', null)
        .order('full_name')
      setEmployees(data ?? [])
      setLoading(false)
    }
    loadEmployees()
    const channel = supabase.channel('payroll')
      .on('postgres_changes',{event:'*',schema:'public',table:'user_profiles'},loadEmployees)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const days = ['Mon','Tue','Wed','Thu','Fri','Sat']

  return (
    <div style={{padding:'2rem',maxWidth:1200,margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem',flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{fontSize:24,fontWeight:700,color:'#111827',margin:'0 0 4px'}}>Payroll</h1>
          <p style={{fontSize:14,color:'#6b7280',margin:0}}>Weekly payroll tracking</p>
        </div>
        <button style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontSize:14,fontWeight:600,cursor:'pointer'}}>Export CSV</button>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:12,marginBottom:'1.5rem'}}>
        {[
          {label:'Employees',value:employees.length},
          {label:'Total Hrs (week)',value:'—'},
          {label:'Overtime Hrs',value:'—'},
          {label:'Est. Payroll',value:'—'},
        ].map(s=>(
          <div key={s.label} style={{background:'#fff',borderRadius:12,padding:'1rem',border:'1px solid #e5e7eb'}}>
            <p style={{fontSize:12,color:'#6b7280',margin:'0 0 4px'}}>{s.label}</p>
            <p style={{fontSize:20,fontWeight:700,color:'#111827',margin:0}}>{s.value}</p>
          </div>
        ))}
      </div>

      {loading ? <p>Loading...</p> : (
        <div style={{background:'#fff',borderRadius:16,border:'1px solid #e5e7eb',overflow:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:'#f9fafb',borderBottom:'1px solid #e5e7eb'}}>
                <th style={{padding:'12px 16px',textAlign:'left',fontSize:12,fontWeight:600,color:'#6b7280'}}>Employee</th>
                <th style={{padding:'12px 16px',textAlign:'left',fontSize:12,fontWeight:600,color:'#6b7280'}}>Role</th>
                {days.map(d=>(
                  <th key={d} style={{padding:'12px 16px',textAlign:'center',fontSize:12,fontWeight:600,color:'#6b7280'}}>{d}</th>
                ))}
                <th style={{padding:'12px 16px',textAlign:'left',fontSize:12,fontWeight:600,color:'#6b7280'}}>Total Hrs</th>
                <th style={{padding:'12px 16px',textAlign:'left',fontSize:12,fontWeight:600,color:'#6b7280'}}>Est. Pay</th>
              </tr>
            </thead>
            <tbody>
              {employees.length===0 ? (
                <tr><td colSpan={10} style={{padding:'2rem',textAlign:'center',color:'#9ca3af'}}>No employees found</td></tr>
              ) : employees.map(e=>(
                <tr key={e.id} style={{borderBottom:'1px solid #f3f4f6'}}>
                  <td style={{padding:'12px 16px',fontSize:14,fontWeight:500}}>{e.full_name||'—'}</td>
                  <td style={{padding:'12px 16px',fontSize:14,color:'#6b7280'}}>{e.role}</td>
                  {days.map(d=>(
                    <td key={d} style={{padding:'12px 16px',textAlign:'center'}}>
                      <input type="number" placeholder="0" style={{width:50,height:32,padding:'0 6px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:13,textAlign:'center',outline:'none'}} />
                    </td>
                  ))}
                  <td style={{padding:'12px 16px',fontSize:14,fontWeight:600}}>0</td>
                  <td style={{padding:'12px 16px',fontSize:14,color:'#6b7280'}}>$0</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}