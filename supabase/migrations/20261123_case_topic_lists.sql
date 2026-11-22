-- Clinical cases: a standard list of topics for each system (as many as its syllabus
-- needs, plus Miscellaneous),
-- and only listed topics are accepted. New topics are added on purpose from the admin
-- panel (admin_region_add_topic), never by a typo in a pasted case.

update public.case_regions r set topics = t.topics from (values
  ('cardio', array['Ischaemic heart disease & ACS','Arrhythmias & conduction blocks','Heart failure','Valvular heart disease','Rheumatic fever','Infective endocarditis','Cardiomyopathies','Myocarditis','Pericardial diseases','Congenital heart disease','Hypertension','Aortic disease','Peripheral vascular & venous disease','Pulmonary hypertension & cor pulmonale','Shock & cardiac arrest','Dyslipidaemia & preventive cardiology','Syncope','Cardiac tumours','Heart in pregnancy & systemic disease','Cardiovascular drugs','ECG & cardiac investigations','Miscellaneous']),
  ('resp', array['Asthma','COPD','Pneumonia','Tuberculosis','Bronchiectasis & cystic fibrosis','Interstitial lung disease','Sarcoidosis','Occupational lung disease','Pulmonary embolism','Pulmonary hypertension','Pleural effusion & empyema','Pneumothorax','Lung cancer','Mediastinal masses','Lung abscess & haemoptysis','ARDS & respiratory failure','Sleep-disordered breathing','Pulmonary function tests & ABG','Miscellaneous']),
  ('neuro', array['Stroke & TIA','Intracerebral & subarachnoid haemorrhage','Cerebral venous thrombosis','Seizures & epilepsy','Headache & migraine','Meningitis','Encephalitis & brain abscess','Multiple sclerosis & demyelination','Parkinson disease & movement disorders','Dementia','Cerebellar & ataxic disorders','Cranial nerve disorders','Peripheral neuropathy','Guillain–Barré syndrome','Myasthenia gravis & NMJ disorders','Muscle diseases','Motor neuron disease','Spinal cord disorders','Brain tumours & raised ICP','Coma & brain death','Head injury','Neurocutaneous syndromes','Miscellaneous']),
  ('gi', array['Oesophageal disorders','Peptic ulcer disease & H. pylori','Upper GI bleeding','Lower GI bleeding','Inflammatory bowel disease','Malabsorption & coeliac disease','Infective & chronic diarrhoea','IBS & functional disorders','Colorectal polyps & cancer','Gastric cancer','Viral hepatitis','Alcoholic & fatty liver disease','Autoimmune & metabolic liver disease','Cirrhosis & portal hypertension','Acute liver failure','Drug-induced liver injury','Jaundice','Gallstones & cholecystitis','Cholangitis & biliary obstruction','Acute pancreatitis','Chronic pancreatitis','Pancreatic & hepatobiliary cancer','Acute abdomen & obstruction','Miscellaneous']),
  ('renal', array['Acute kidney injury','Chronic kidney disease','Dialysis & transplantation','Nephrotic syndrome','Nephritic syndrome & glomerulonephritis','Tubulointerstitial disease','Renal tubular acidosis & tubular disorders','Drug nephrotoxicity','Sodium & water disorders','Potassium disorders','Acid–base disorders','Calcium, phosphate & magnesium','UTI & pyelonephritis','Kidney stones','Obstructive uropathy','Polycystic & inherited kidney disease','Renovascular disease','Diabetic & hypertensive nephropathy','Renal tumours','Miscellaneous']),
  ('endo', array['Type 1 diabetes','Type 2 diabetes','Diabetic complications','DKA & HHS','Hypoglycaemia','Hyperthyroidism','Hypothyroidism','Thyroiditis','Thyroid nodules & cancer','Cushing syndrome','Adrenal insufficiency','Hyperaldosteronism','Pheochromocytoma','Congenital adrenal hyperplasia','Pituitary tumours & hyperprolactinaemia','Hypopituitarism','Acromegaly & growth disorders','Diabetes insipidus & SIADH','Hyperparathyroidism & hypercalcaemia','Hypoparathyroidism & hypocalcaemia','Osteoporosis & metabolic bone disease','MEN & neuroendocrine tumours','Puberty & gonadal disorders','Obesity & lipid disorders','Miscellaneous']),
  ('heme', array['Iron deficiency anaemia','Thalassaemia','Megaloblastic anaemia','Haemolytic anaemias','Sickle cell disease','Aplastic anaemia & marrow failure','Platelet disorders','Haemophilia & coagulation disorders','DIC','Thrombophilia & anticoagulation','Acute leukaemias','Chronic myeloid leukaemia','Chronic lymphocytic leukaemia','Myeloproliferative neoplasms','Myelodysplastic syndromes','Hodgkin lymphoma','Non-Hodgkin lymphoma','Multiple myeloma & plasma cell disorders','Transfusion medicine','Stem cell transplantation','Chemotherapy & targeted therapy','Oncologic emergencies','Paraneoplastic syndromes','Tumour markers & cancer screening','Miscellaneous']),
  ('id', array['Sepsis','Fever of unknown origin','Malaria','Dengue & arboviral fevers','Typhoid','Leptospirosis','Scrub typhus & rickettsial fevers','Tuberculosis','Leprosy','HIV','Opportunistic infections','Meningitis & encephalitis','Respiratory infections & COVID-19','Infective diarrhoea & cholera','Sexually transmitted infections','Fungal infections','Helminthic infections','Protozoal infections','Zoonoses','Tetanus & diphtheria','Hospital-acquired & resistant infections','Antimicrobials','Vaccines & immunisation','Miscellaneous']),
  ('msk', array['Rheumatoid arthritis','Ankylosing spondylitis & axial SpA','Psoriatic & reactive arthritis','Osteoarthritis','Gout','Pseudogout (CPPD)','Septic arthritis','Osteomyelitis','SLE','Antiphospholipid syndrome','Systemic sclerosis','Inflammatory myositis','Sjögren syndrome','Large-vessel vasculitis','Medium-vessel vasculitis','ANCA & small-vessel vasculitis','Behçet & other vasculitis','Polymyalgia rheumatica & fibromyalgia','Osteoporosis','Paget disease & bone disorders','Back pain & spinal disorders','Fractures & dislocations','Bone tumours','Sports & soft-tissue injuries','Juvenile arthritis','Miscellaneous']),
  ('obgyn', array['Antenatal care & physiology of pregnancy','Prenatal screening & diagnosis','Early pregnancy loss','Ectopic pregnancy','Gestational trophoblastic disease','Hyperemesis gravidarum','Hypertensive disorders of pregnancy','Diabetes in pregnancy','Anaemia & medical disorders in pregnancy','Infections in pregnancy','Antepartum haemorrhage','Multiple pregnancy','Fetal growth restriction & surveillance','Rh isoimmunisation','Preterm labour & PROM','Normal labour','Abnormal labour & malpresentation','Operative delivery & caesarean section','Postpartum haemorrhage','Puerperium & lactation','Menstrual disorders','Amenorrhoea','PCOS','Endometriosis & adenomyosis','Fibroids','Infertility','Contraception','Menopause','Genital infections & PID','Prolapse & urogynaecology','Cervical cancer & screening','Endometrial cancer','Ovarian tumours','Miscellaneous']),
  ('peds', array['Neonatal resuscitation','Birth asphyxia & HIE','Neonatal jaundice','Respiratory distress in the newborn','Neonatal sepsis','Prematurity & low birth weight','Neonatal hypoglycaemia & metabolic problems','Growth','Development & milestones','Nutrition & breastfeeding','Severe acute malnutrition','Vitamin & mineral deficiencies','Immunisation','Exanthematous fevers','Diarrhoea & dehydration','Respiratory infections in children','Paediatric TB & HIV','Congenital heart disease','Rheumatic fever & Kawasaki disease','Paediatric nephrology','Paediatric haematology & oncology','Genetic & chromosomal disorders','Inborn errors of metabolism','Paediatric endocrinology','Paediatric neurology','Behavioural & developmental disorders','Adolescent health','Paediatric emergencies & poisoning','Paediatric surgery','Miscellaneous']),
  ('psych', array['Schizophrenia','Other psychotic disorders','Depression','Bipolar disorder','Suicide & self-harm risk','Anxiety & panic disorders','OCD & related disorders','PTSD & stress disorders','Somatic symptom & dissociative disorders','Eating disorders','Sleep disorders','Alcohol use disorder','Opioid & other drug use','Delirium','Dementia','Personality disorders','Child & adolescent psychiatry','Intellectual disability & autism','Antipsychotics','Antidepressants & mood stabilisers','Psychiatric emergencies','Psychotherapies','Mental health law & forensic psychiatry','Miscellaneous']),
  ('emerg', array['Cardiac arrest & ACLS','Shock','Sepsis in the ED','Airway management','Mechanical ventilation','Polytrauma & ATLS','Head injury','Spinal injury','Chest & abdominal trauma','Burns','Organophosphate & pesticide poisoning','Drug overdose','Snake bite & envenomation','Heat stroke & hypothermia','Drowning & electrical injury','Anaphylaxis','Acute chest pain & breathlessness','Altered sensorium & coma','Fluids, electrolytes & acid–base','Sedation & analgesia','ICU care & organ support','Triage & disaster management','Miscellaneous'])
) as t(id, topics) where r.id = t.id;

-- Existing cases: old names to the new ones; anything else (or none) to Miscellaneous.
update public.clinical_cases set topic = 'Ischaemic heart disease & ACS' where region_id = 'cardio' and topic in ('Acute coronary syndromes', 'Acute coronary syndromes & IHD');
update public.clinical_cases set topic = 'Arrhythmias & conduction blocks' where region_id = 'cardio' and topic = 'Arrhythmias';
update public.clinical_cases set topic = 'Aortic disease' where region_id = 'cardio' and topic = 'Aortic diseases';
update public.clinical_cases set topic = 'Shock & cardiac arrest' where region_id = 'cardio' and topic = 'Shock';
update public.clinical_cases c set topic = 'Miscellaneous'
  from public.case_regions r where r.id = c.region_id and not (c.topic = any(r.topics));

-- The listed spelling of a topic in a region (case-insensitive), or null.
create or replace function public.case_topic_canonical(p_region text, p_topic text)
returns text language sql stable security definer set search_path = public as $$
  select t from case_regions r, unnest(r.topics) t
  where r.id = p_region and lower(t) = lower(trim(coalesce(p_topic, ''))) limit 1;
$$;

-- Add a topic to a region's list (just before Miscellaneous). Returns the new list.
create or replace function public.admin_region_add_topic(p_region text, p_topic text)
returns text[] language plpgsql volatile security definer set search_path = public as $$
declare t text := regexp_replace(trim(coalesce(p_topic, '')), '\s+', ' ', 'g'); cur text[];
begin
  if not public.mock_is_admin() then raise exception 'NOT_ADMIN'; end if;
  if length(t) < 2 or length(t) > 80 then raise exception 'BAD_TOPIC'; end if;
  select topics into cur from case_regions where id = p_region;
  if not found then raise exception 'BAD_REGION'; end if;
  if public.case_topic_canonical(p_region, t) is null then
    if 'Miscellaneous' = any(cur) then
      cur := array_remove(cur, 'Miscellaneous') || t || 'Miscellaneous'::text;
    else
      cur := cur || t;
    end if;
    update case_regions set topics = cur where id = p_region;
  end if;
  return cur;
end $$;
revoke all on function public.admin_region_add_topic(text, text) from public, anon;
grant execute on function public.admin_region_add_topic(text, text) to authenticated;
revoke all on function public.case_topic_canonical(text, text) from public, anon, authenticated;

-- Saving a case: the topic must be one of the region's listed topics.
create or replace function public.admin_case_save(p jsonb)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare cid uuid := nullif(p->>'id', '')::uuid; st jsonb; i int := 0; keys text[]; tp text;
begin
  if not public.mock_is_admin() then raise exception 'NOT_ADMIN'; end if;
  if not exists (select 1 from case_regions where id = p->>'region_id') then raise exception 'BAD_REGION'; end if;
  if coalesce(trim(p->>'topic'), '') = '' then raise exception 'TOPIC_REQUIRED'; end if;
  tp := public.case_topic_canonical(p->>'region_id', p->>'topic');
  if tp is null then raise exception 'TOPIC_NOT_IN_LIST'; end if;
  if coalesce(p->>'level','') not in ('core','advanced') then raise exception 'BAD_LEVEL'; end if;
  if length(trim(coalesce(p->>'title',''))) < 3 then raise exception 'BAD_TITLE'; end if;
  if length(trim(coalesce(p->>'vignette',''))) < 10 then raise exception 'BAD_VIGNETTE'; end if;
  if jsonb_typeof(p->'steps') <> 'array' or jsonb_array_length(p->'steps') = 0 then raise exception 'NO_STEPS'; end if;
  if jsonb_array_length(p->'steps') > 15 then raise exception 'TOO_MANY_STEPS'; end if;
  for st in select * from jsonb_array_elements(p->'steps') loop
    i := i + 1;
    if length(trim(coalesce(st->>'stem',''))) < 3 then raise exception 'BAD_STEM %', i; end if;
    if jsonb_typeof(st->'options') <> 'array' or jsonb_array_length(st->'options') < 2 then raise exception 'BAD_OPTIONS %', i; end if;
    select array_agg(upper(o->>'key')) into keys from jsonb_array_elements(st->'options') o where length(trim(coalesce(o->>'text',''))) > 0;
    if coalesce(array_length(keys,1),0) < 2 then raise exception 'BAD_OPTIONS %', i; end if;
    if not (upper(coalesce(st->>'correct_key','')) = any(keys)) then raise exception 'BAD_ANSWER %', i; end if;
  end loop;

  if cid is null then
    insert into clinical_cases (region_id, topic, keywords, level, title, summary, exam_tags, vignette, est_minutes, is_free, published, sort)
    values (p->>'region_id', tp, left(trim(coalesce(p->>'keywords','')), 500),
      p->>'level', trim(p->>'title'), coalesce(trim(p->>'summary'),''),
      coalesce((select array_agg(trim(x)) from jsonb_array_elements_text(coalesce(p->'exam_tags','[]')) x where trim(x) <> ''), '{}'),
      p->>'vignette', greatest(1, least(coalesce((p->>'est_minutes')::int, 8), 120)),
      coalesce((p->>'is_free')::boolean, false), coalesce((p->>'published')::boolean, false), coalesce((p->>'sort')::int, 0))
    returning id into cid;
  else
    update clinical_cases set region_id = p->>'region_id', topic = tp,
      keywords = left(trim(coalesce(p->>'keywords','')), 500),
      level = p->>'level', title = trim(p->>'title'), summary = coalesce(trim(p->>'summary'),''),
      exam_tags = coalesce((select array_agg(trim(x)) from jsonb_array_elements_text(coalesce(p->'exam_tags','[]')) x where trim(x) <> ''), '{}'),
      vignette = p->>'vignette', est_minutes = greatest(1, least(coalesce((p->>'est_minutes')::int, 8), 120)),
      is_free = coalesce((p->>'is_free')::boolean, false), published = coalesce((p->>'published')::boolean, false),
      sort = coalesce((p->>'sort')::int, 0), updated_at = now()
    where id = cid;
    if not found then raise exception 'CASE_NOT_FOUND'; end if;
    delete from case_steps where case_id = cid;
  end if;

  insert into case_steps (case_id, step_no, reveal, stem, options, correct_key, explanation, learning_point)
  select cid, e.n::int, nullif(trim(coalesce(e.s->>'reveal','')), ''), e.s->>'stem',
    (select jsonb_agg(jsonb_build_object('key', upper(o->>'key'), 'text', trim(o->>'text'))) from jsonb_array_elements(e.s->'options') o where length(trim(coalesce(o->>'text',''))) > 0),
    upper(e.s->>'correct_key'), coalesce(e.s->>'explanation',''), coalesce(trim(e.s->>'learning_point'),'')
  from jsonb_array_elements(p->'steps') with ordinality as e(s, n);

  return cid;
end $$;
