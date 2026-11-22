-- Four starter clinical cases, inserted as DRAFTS (published = false).
-- Admins see drafts in the app with a "Draft" badge. After medical review:
--   update clinical_cases set published = true where title = '...';
-- Re-running this file is safe: it skips titles that already exist.

do $$
declare cid uuid;
begin
-- 1 ---------------------------------------------------------------------------
if not exists (select 1 from clinical_cases where title = 'Crushing chest pain and a falling BP') then
insert into clinical_cases (region_id, level, title, summary, exam_tags, vignette, est_minutes, is_free, sort)
values ('cardio', 'core', 'Crushing chest pain and a falling BP',
  'A 58-year-old smoker with 40 minutes of central chest pain.',
  '{NEET PG,INI-CET,FMGE,USMLE}',
  $v$<p>A 58-year-old man is brought to the emergency department with <b>40 minutes of crushing central chest pain</b> radiating to the jaw, with sweating and nausea. He smokes 20 cigarettes a day and has type 2 diabetes.</p>
<p><b>On examination:</b> pulse 54/min regular, BP 108/70 mmHg, SpO₂ 96% on room air. JVP is raised. Chest is clear on auscultation.</p>
<p><b>12-lead ECG:</b> 3 mm ST elevation in II, III and aVF, with ST depression in I and aVL. ST elevation is greater in III than in II.</p>$v$,
  8, true, 1)
returning id into cid;
insert into case_steps (case_id, step_no, reveal, stem, options, correct_key, explanation, learning_point) values
(cid, 1, null, 'Which coronary artery is most likely occluded?',
 '[{"key":"A","text":"Left anterior descending artery"},{"key":"B","text":"Left circumflex artery"},{"key":"C","text":"Right coronary artery"},{"key":"D","text":"Left main stem"}]', 'C',
 'ST elevation in II, III and aVF is an <b>inferior STEMI</b>. ST elevation greater in III than II, with reciprocal depression in I/aVL, points to the <b>right coronary artery</b>. The bradycardia fits too: the RCA supplies the SA node in about 60% and the AV node in about 85–90% of people. A circumflex culprit tends to give lead II ≥ III and ST elevation in I/aVL or V5–V6.',
 'Inferior STEMI with STE III > II and reciprocal change in I/aVL → RCA.'),
(cid, 2, '<p>A junior gives <b>sublingual nitroglycerin</b> for the pain. Ten minutes later BP is <b>78/50 mmHg</b>, he is light-headed, the JVP is still raised and the lungs remain clear.</p>',
 'What is the best next step to confirm the cause of his hypotension?',
 '[{"key":"A","text":"Right-sided chest leads (V4R)"},{"key":"B","text":"Urgent CT pulmonary angiogram"},{"key":"C","text":"Chest X-ray"},{"key":"D","text":"Repeat troponin in 3 hours"}]', 'A',
 'Hypotension + raised JVP + <b>clear lungs</b> after a preload-reducing drug in inferior STEMI is the classic picture of <b>right ventricular infarction</b>. ST elevation ≥ 1 mm in <b>V4R</b> confirms it and should be recorded in every inferior STEMI. A CTPA would delay reperfusion; troponin does not change the immediate plan.',
 'Inferior STEMI + hypotension + clear lungs + raised JVP → think RV infarct; record V4R.'),
(cid, 3, '<p>V4R shows 1.5 mm ST elevation.</p>',
 'Which immediate measure is most appropriate for his blood pressure?',
 '[{"key":"A","text":"IV furosemide"},{"key":"B","text":"IV normal saline bolus"},{"key":"C","text":"Repeat nitroglycerin as an infusion"},{"key":"D","text":"Oral metoprolol"}]', 'B',
 'The infarcted right ventricle is <b>preload dependent</b>. Give cautious IV crystalloid boluses while watching the lungs. Avoid nitrates, diuretics and opioids where possible, as they drop preload further. Beta-blockers are inappropriate with bradycardia and hypotension. If fluids fail, inotropes (e.g. dobutamine) are added.',
 'RV infarct: give fluids, avoid nitrates and diuretics.'),
(cid, 4, '<p>After 500 mL saline his BP is 100/64 mmHg. The nearest PCI-capable hospital is 40 minutes away by ambulance.</p>',
 'What is the preferred reperfusion strategy?',
 '[{"key":"A","text":"Fibrinolysis now, then transfer only if it fails"},{"key":"B","text":"Transfer for primary PCI"},{"key":"C","text":"Medical treatment and elective angiography next week"},{"key":"D","text":"Urgent CABG"}]', 'B',
 '<b>Primary PCI</b> is preferred when it can be done within <b>120 minutes</b> of STEMI diagnosis. A 40-minute transfer fits comfortably. Fibrinolysis is the choice only when that window cannot be met, followed by transfer to a PCI centre (pharmaco-invasive strategy). Give aspirin and a P2Y12 inhibitor before transfer.',
 'STEMI: primary PCI if achievable within 120 min of diagnosis; otherwise fibrinolysis within 10 min and transfer.');
end if;

-- 2 ---------------------------------------------------------------------------
if not exists (select 1 from clinical_cases where title = 'Sudden word-finding difficulty at breakfast') then
insert into clinical_cases (region_id, level, title, summary, exam_tags, vignette, est_minutes, is_free, sort)
values ('neuro', 'advanced', 'Sudden word-finding difficulty at breakfast',
  'A 68-year-old woman found struggling to speak, last seen well 2 hours ago.',
  '{NEET SS,INI-CET,USMLE}',
  $v$<p>A 68-year-old woman is brought in by her husband. At breakfast <b>2 hours ago</b> she suddenly could not find her words and dropped her cup from her right hand. She has hypertension and takes amlodipine. No anticoagulants.</p>
<p><b>On examination:</b> pulse 112/min <b>irregularly irregular</b>, BP 196/112 mmHg, glucose 128 mg/dL. She has an expressive aphasia, right facial weakness sparing the forehead, and right arm weakness (power 2/5) more than leg (4/5). NIHSS 12.</p>$v$,
  10, false, 1)
returning id into cid;
insert into case_steps (case_id, step_no, reveal, stem, options, correct_key, explanation, learning_point) values
(cid, 1, null, 'What is the most appropriate first investigation?',
 '[{"key":"A","text":"MRI brain with diffusion-weighted imaging"},{"key":"B","text":"Non-contrast CT head"},{"key":"C","text":"Carotid Doppler"},{"key":"D","text":"Lumbar puncture"}]', 'B',
 'A <b>non-contrast CT</b> is fast, widely available and excludes haemorrhage, which is what decides eligibility for thrombolysis. CT angiography is usually done in the same sitting to look for a large-vessel occlusion. MRI-DWI is more sensitive for early ischaemia but should not delay treatment.',
 'Suspected stroke: non-contrast CT first, to exclude bleeding before thrombolysis.'),
(cid, 2, '<p>CT shows no haemorrhage and no established infarct (ASPECTS 9). She is a candidate for IV thrombolysis.</p>',
 'Before starting thrombolysis, her blood pressure must be lowered to below:',
 '[{"key":"A","text":"220/120 mmHg"},{"key":"B","text":"185/110 mmHg"},{"key":"C","text":"160/90 mmHg"},{"key":"D","text":"140/90 mmHg"}]', 'B',
 'BP must be <b>below 185/110 mmHg</b> before IV alteplase or tenecteplase, and kept <b>below 180/105 mmHg for 24 hours</b> afterwards, with IV labetalol or nicardipine. The 220/120 threshold applies to patients who are <i>not</i> receiving reperfusion treatment.',
 'Thrombolysis: BP < 185/110 before, < 180/105 for 24 h after.'),
(cid, 3, '<p>BP comes down to 176/100 mmHg with IV labetalol and thrombolysis is started. CT angiography shows an <b>occlusion of the proximal left middle cerebral artery (M1)</b>.</p>',
 'What should be done next?',
 '[{"key":"A","text":"Wait 24 hours and repeat the CT"},{"key":"B","text":"Start IV heparin infusion"},{"key":"C","text":"Proceed to mechanical thrombectomy"},{"key":"D","text":"Decompressive hemicraniectomy"}]', 'C',
 'A large-vessel occlusion (ICA or M1) with a disabling deficit should go for <b>mechanical thrombectomy</b> as well as thrombolysis; do not wait to see if the drug works. Thrombectomy is standard up to 6 hours, and up to 24 hours in selected patients on perfusion imaging. Heparin is contraindicated in the 24 hours after thrombolysis.',
 'LVO stroke: thrombolyse AND send for thrombectomy, without waiting for a response.'),
(cid, 4, '<p>After thrombectomy she recovers well (NIHSS 2). Monitoring confirms <b>non-valvular atrial fibrillation</b>. CHA₂DS₂-VASc is 5.</p>',
 'Which is the preferred long-term stroke prevention?',
 '[{"key":"A","text":"Aspirin alone"},{"key":"B","text":"Aspirin plus clopidogrel"},{"key":"C","text":"A direct oral anticoagulant (e.g. apixaban)"},{"key":"D","text":"No antithrombotic, rate control only"}]', 'C',
 'In non-valvular AF, <b>DOACs</b> are preferred over warfarin (similar or better efficacy, less intracranial bleeding). Antiplatelets are not an adequate substitute. Timing after stroke depends on infarct size; for a minor stroke, early start within a few days is now supported (ELAN, TIMING trials).',
 'Cardioembolic stroke with non-valvular AF → DOAC, started early when the infarct is small.');
end if;

-- 3 ---------------------------------------------------------------------------
if not exists (select 1 from clinical_cases where title = 'Vomiting, thirst and deep sighing breaths') then
insert into clinical_cases (region_id, level, title, summary, exam_tags, vignette, est_minutes, is_free, sort)
values ('endo', 'core', 'Vomiting, thirst and deep sighing breaths',
  'A 19-year-old college student with type 1 diabetes who stopped her insulin.',
  '{NEET PG,FMGE,INI-CET,USMLE}',
  $v$<p>A 19-year-old woman with <b>type 1 diabetes</b> presents with 2 days of vomiting, abdominal pain and severe thirst. She ran out of insulin 3 days ago.</p>
<p><b>On examination:</b> drowsy but rousable, dry mucosa, pulse 124/min, BP 98/60 mmHg, RR 30/min with <b>deep, sighing breaths</b> and a fruity smell.</p>
<p><b>Labs:</b> glucose 420 mg/dL, pH 7.12, HCO₃⁻ 9 mmol/L, Na⁺ 132, Cl⁻ 96, K⁺ 3.1 mmol/L, urine ketones 3+, serum β-hydroxybutyrate 5.8 mmol/L.</p>$v$,
  8, true, 1)
returning id into cid;
insert into case_steps (case_id, step_no, reveal, stem, options, correct_key, explanation, learning_point) values
(cid, 1, null, 'What is her anion gap and what does it show?',
 '[{"key":"A","text":"12 — normal gap acidosis"},{"key":"B","text":"27 — high anion gap metabolic acidosis"},{"key":"C","text":"36 — mixed respiratory and metabolic acidosis"},{"key":"D","text":"20 — lactic acidosis only"}]', 'B',
 'Anion gap = Na⁺ − (Cl⁻ + HCO₃⁻) = 132 − (96 + 9) = <b>27</b> (normal about 8–12). With glucose > 250 mg/dL, pH < 7.3, HCO₃⁻ < 18 and ketonaemia, this is <b>diabetic ketoacidosis</b>. pH 7.12 with HCO₃⁻ 9 makes it at least moderate to severe. Kussmaul breathing is respiratory compensation.',
 'DKA = high anion gap metabolic acidosis from ketoacids; calculate the gap.'),
(cid, 2, null, 'What is the first priority in management?',
 '[{"key":"A","text":"IV insulin bolus"},{"key":"B","text":"IV sodium bicarbonate"},{"key":"C","text":"IV 0.9% saline"},{"key":"D","text":"Oral rehydration"}]', 'C',
 'Fluid deficit in DKA is often 5–7 L. Start with <b>isotonic saline</b> (about 1 L in the first hour, then guided by haemodynamics and sodium). Fluids alone lower glucose and improve perfusion. Bicarbonate is reserved for pH below 6.9–7.0.',
 'DKA: fluids first.'),
(cid, 3, '<p>One litre of saline is running. Potassium is still <b>3.1 mmol/L</b>.</p>',
 'What should be done about insulin?',
 '[{"key":"A","text":"Start insulin infusion 0.1 U/kg/h now"},{"key":"B","text":"Hold insulin and replace potassium until K⁺ ≥ 3.3 mmol/L"},{"key":"C","text":"Give subcutaneous insulin instead"},{"key":"D","text":"Give insulin with IV bicarbonate"}]', 'B',
 'Insulin pushes potassium into cells. Starting it with K⁺ below <b>3.3 mmol/L</b> risks arrhythmia and respiratory muscle weakness. Total body potassium is low in DKA even when the serum level looks normal. Replace potassium (e.g. 20–30 mmol/h) and start the insulin infusion once K⁺ ≥ 3.3.',
 'DKA: K⁺ < 3.3 → hold insulin, replace K⁺ first.'),
(cid, 4, '<p>Insulin infusion has been running for 6 hours. Glucose is now <b>230 mg/dL</b>; pH 7.24, HCO₃⁻ 14, anion gap 18.</p>',
 'What is the next step?',
 '[{"key":"A","text":"Stop the insulin infusion"},{"key":"B","text":"Switch to subcutaneous insulin now"},{"key":"C","text":"Add 5% dextrose and continue the insulin infusion"},{"key":"D","text":"Double the insulin rate"}]', 'C',
 'The goal is to clear the <b>ketoacidosis</b>, not just the glucose. When glucose falls to about 200–250 mg/dL, <b>add dextrose</b> and keep the insulin running (rate may be reduced) until the anion gap closes and HCO₃⁻ ≥ 15–18, pH > 7.3. Overlap subcutaneous basal insulin by 1–2 hours before stopping the drip.',
 'Glucose corrects before ketosis: add dextrose, keep insulin until the gap closes.');
end if;

-- 4 ---------------------------------------------------------------------------
if not exists (select 1 from clinical_cases where title = 'A newborn with green vomit') then
insert into clinical_cases (region_id, level, title, summary, exam_tags, vignette, est_minutes, is_free, sort)
values ('peds', 'advanced', 'A newborn with green vomit',
  'A 3-day-old term baby who was feeding well until this morning.',
  '{NEET SS,INI-CET,USMLE}',
  $v$<p>A <b>3-day-old</b> term baby boy, birth weight 3.1 kg, was breastfeeding well and passed meconium on day 1. This morning he started <b>vomiting bright green fluid</b> after every feed.</p>
<p><b>On examination:</b> irritable, heart rate 172/min, capillary refill 3 s. The abdomen is <b>soft and not distended</b>. No hernias. Anus normally placed.</p>$v$,
  7, false, 2)
returning id into cid;
insert into case_steps (case_id, step_no, reveal, stem, options, correct_key, explanation, learning_point) values
(cid, 1, null, 'After resuscitation and nasogastric decompression, what is the investigation of choice?',
 '[{"key":"A","text":"Abdominal ultrasound for pyloric stenosis"},{"key":"B","text":"Urgent upper GI contrast study"},{"key":"C","text":"Contrast enema"},{"key":"D","text":"Observe and repeat feeds in 12 hours"}]', 'B',
 '<b>Bilious vomiting in a neonate is malrotation with volvulus until proven otherwise</b>: a surgical emergency. A soft, flat abdomen does not exclude it, because the obstruction is proximal. An <b>upper GI contrast study</b> is the investigation of choice to show where the duodenojejunal (DJ) flexure lies. Pyloric stenosis gives non-bilious vomiting at 2–8 weeks.',
 'Neonate + bilious vomiting → urgent upper GI contrast for malrotation.'),
(cid, 2, '<p>The study shows the <b>DJ flexure lying to the right of the midline</b>, with a <b>corkscrew</b> appearance of the proximal jejunum.</p>',
 'What is the diagnosis?',
 '[{"key":"A","text":"Duodenal atresia"},{"key":"B","text":"Annular pancreas"},{"key":"C","text":"Malrotation with midgut volvulus"},{"key":"D","text":"Jejunal atresia"}]', 'C',
 'A DJ flexure that fails to cross to the left of the spine at the level of the pylorus means <b>malrotation</b>. A corkscrew course of the duodenum and jejunum means the narrow-based mesentery has twisted: <b>midgut volvulus</b>, which can infarct the bowel from duodenum to mid-transverse colon within hours. Duodenal atresia gives a "double bubble" from birth.',
 'Malposition of DJ flexure = malrotation; corkscrew = volvulus.'),
(cid, 3, null, 'What is the definitive management?',
 '[{"key":"A","text":"Nil by mouth and IV antibiotics for 48 hours"},{"key":"B","text":"Emergency Ladd procedure"},{"key":"C","text":"Elective surgery at 6 months"},{"key":"D","text":"Endoscopic detorsion"}]', 'B',
 'Emergency laparotomy with a <b>Ladd procedure</b>: counter-clockwise detorsion of the bowel, division of Ladd bands, widening of the mesenteric base, and appendicectomy, leaving the small bowel on the right and colon on the left. Non-viable bowel is resected; doubtful segments get a second-look operation.',
 'Volvulus: emergency Ladd procedure; every hour of delay risks the whole midgut.');
end if;
end $$;
