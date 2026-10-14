import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, LoaderCircle, Sparkles } from 'lucide-react';
import { supabaseBrowser, userFacingErrorMessage } from '../services/supabaseBrowser.js';

const localDate = (date) => {
  const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
};
const kes=(value)=>new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES',maximumFractionDigits:0}).format(Number(value||0));

export default function PublicBookingPage({slug}){
  const [page,setPage]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const [serviceId,setServiceId]=useState(''),[day,setDay]=useState(()=>localDate(new Date(Date.now()+86400000)));
  const [slots,setSlots]=useState([]),[slot,setSlot]=useState(''),[availabilityBusy,setAvailabilityBusy]=useState(false);
  const [form,setForm]=useState({customer_name:'',customer_phone:'',customer_email:'',vehicle_registration:'',customer_notes:''});
  const [submitting,setSubmitting]=useState(false),[confirmation,setConfirmation]=useState('');
  useEffect(()=>{let alive=true;(async()=>{try{if(!supabaseBrowser)throw new Error('Online booking is not configured yet. Please contact the business.');const {data,error:rpcError}=await supabaseBrowser.rpc('carwash_public_booking_page',{p_slug:slug});if(rpcError)throw rpcError;if(alive){setPage(data);setServiceId(data?.services?.[0]?.id||'');}}catch(cause){if(alive)setError(userFacingErrorMessage(cause,'This booking page is unavailable. Check the link or contact the business.'));}finally{if(alive)setLoading(false);}})();return()=>{alive=false;};},[slug]);
  const service=useMemo(()=>page?.services?.find((row)=>row.id===serviceId),[page,serviceId]);
  useEffect(()=>{let alive=true;setSlots([]);setSlot('');if(!serviceId||!day||!supabaseBrowser)return undefined;setAvailabilityBusy(true);supabaseBrowser.rpc('carwash_public_booking_availability',{p_slug:slug,p_service:serviceId,p_day:day}).then(({data,error:rpcError})=>{if(!alive)return;if(rpcError)setError(userFacingErrorMessage(rpcError,'Could not load available times.'));else setError('');setSlots((data||[]).map((row)=>row.slot_start));}).finally(()=>alive&&setAvailabilityBusy(false));return()=>{alive=false;};},[slug,serviceId,day]);
  async function submit(event){
    event.preventDefault();setError('');setConfirmation('');
    if(!slot||!service){setError('Choose a service and an available time.');return;}
    setSubmitting(true);
    try{
      const {data,error:rpcError}=await supabaseBrowser.rpc('carwash_create_online_booking',{
        p_slug:slug,p_service:serviceId,p_starts_at:slot,p_customer_name:form.customer_name,
        p_customer_phone:form.customer_phone,p_customer_email:form.customer_email||null,
        p_vehicle_registration:form.vehicle_registration,p_customer_notes:form.customer_notes||null
      });
      if(rpcError)throw rpcError;
      if(data?.status!=='CONFIRMED')throw new Error('The business could not confirm this booking. Choose another available time.');
      setConfirmation(`Your booking with ${page.tenant.name} is confirmed. It has been added to this business’s washer queue.`);
      setForm({customer_name:'',customer_phone:'',customer_email:'',vehicle_registration:'',customer_notes:''});
      setSlot('');
      supabaseBrowser.rpc('carwash_public_booking_availability',{p_slug:slug,p_service:serviceId,p_day:day})
        .then(({data,error})=>{if(!error)setSlots((data||[]).map((row)=>row.slot_start));});
    }catch(cause){
      const message=cause?.code==='23505'
        ?(String(cause.message||'').toLowerCase().includes('washer')?'No washer is available at that time. Choose another slot.':'That time is already occupied. Choose another available time.')
        :userFacingErrorMessage(cause,'Could not book that time. It may have just filled; choose another available time.');
      setError(message);
    }finally{setSubmitting(false);}
  }
  return <main className="cw-public-booking"><header className="cw-booking-brand"><a href="/" aria-label="OshaHub home"><img src="/osha-hub-logo.svg" alt="OshaHub"/></a><span>ONLINE BOOKING</span></header><section className="cw-booking-card">{loading?<div className="cw-booking-state"><LoaderCircle className="cw-spin"/><span>Loading booking page…</span></div>:error&&!page?<div className="cw-booking-state"><h1>Booking link unavailable</h1><p>{error}</p><a className="cw-secondary" href="/">Back to OshaHub</a></div>:<><a className="cw-booking-back" href="/"><ArrowLeft size={16}/>OshaHub</a><span className="cw-login-kicker">BOOK A WASH</span><h1>{page?.tenant?.name}</h1><p className="cw-booking-intro">Choose a wash service and a time that works for you.</p>{confirmation&&<div className="cw-booking-success" role="status"><CheckCircle2 size={19}/><span>{confirmation}</span></div>}{error&&<div className="cw-auth-alert error" role="alert">{error}</div>}<form onSubmit={submit}><label className="cw-form-label">WASH SERVICE<select required value={serviceId} onChange={(event)=>setServiceId(event.target.value)}><option value="">Choose a service</option>{page?.services?.map((item)=><option value={item.id} key={item.id}>{item.name} · {kes(item.price_kes)} · {item.estimated_minutes} min</option>)}</select></label>{service&&<div className="cw-booking-service"><Sparkles size={18}/><span><b>{service.name}</b><small>{service.category||'Car wash'} · {service.estimated_minutes} minutes</small></span><strong>{kes(service.price_kes)}</strong></div>}<label className="cw-form-label">DATE<input type="date" required min={localDate(new Date())} max={localDate(new Date(Date.now()+60*86400000))} value={day} onChange={(event)=>setDay(event.target.value)}/></label><fieldset className="cw-booking-times"><legend><Clock3 size={15}/>AVAILABLE TIMES</legend>{availabilityBusy?<p>Checking availability…</p>:slots.length?slots.map((value)=><button type="button" key={value} className={slot===value?'selected':''} onClick={()=>setSlot(value)}>{new Date(value).toLocaleTimeString('en-KE',{timeZone:'Africa/Nairobi',hour:'2-digit',minute:'2-digit',hour12:true})}</button>):<p>No available times for this service and date. Try another day.</p>}</fieldset><label className="cw-form-label">YOUR NAME<input required minLength="2" maxLength="120" autoComplete="name" value={form.customer_name} onChange={(event)=>setForm({...form,customer_name:event.target.value})}/></label><label className="cw-form-label">PHONE<input required type="tel" autoComplete="tel" value={form.customer_phone} onChange={(event)=>setForm({...form,customer_phone:event.target.value})}/></label><label className="cw-form-label">EMAIL <span>(OPTIONAL)</span><input type="email" autoComplete="email" maxLength="254" value={form.customer_email} onChange={(event)=>setForm({...form,customer_email:event.target.value})}/></label><label className="cw-form-label">VEHICLE REGISTRATION<input required maxLength="20" autoCapitalize="characters" value={form.vehicle_registration} onChange={(event)=>setForm({...form,vehicle_registration:event.target.value})}/></label><label className="cw-form-label">NOTES <span>(OPTIONAL)</span><textarea maxLength="1000" rows="3" value={form.customer_notes} onChange={(event)=>setForm({...form,customer_notes:event.target.value})}/></label><button className="cw-primary cw-booking-submit" type="submit" disabled={submitting||availabilityBusy||!slot}>{submitting?'Booking…':<>Confirm booking <CalendarDays size={17}/></>}</button><small className="cw-booking-disclaimer">The selected time is reserved immediately. Your booking and vehicle details go only to {page?.tenant?.name} and its authorized team.</small></form></>}</section></main>;
}
