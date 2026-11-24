// Hand-written SEO copy for the Clinical Cases hub pages.
// build-cases-hubs.mjs merges this with live counts. Placeholders:
// {total} {free} {core} {advanced} {topics}.
//
// title   <= ~60 chars (Google truncates near 600px)
// desc    <= ~155 chars after placeholders are filled
// h1      main words of the H1 ("<h1> <span>Clinical Cases</span>")
// focus   unique paragraph: what this system's cases actually test
// faqs    system-specific questions, added to the visible FAQ and FAQPage schema

export const INDEX = {
  title: '{total} Clinical Cases for NEET PG, INI-CET & FMGE | MedLadder',
  ogTitle: 'Clinical Cases for NEET PG, INI-CET & FMGE — by body system',
  desc: '{total} case-based MCQs with explained answers across 13 body systems, from STEMI to eclampsia. Built for NEET PG, INI-CET, FMGE & NEET SS. {free} free.',
};

export const HUBS = {
  cardiovascular: {
    title: 'Cardiology Clinical Cases for NEET PG & INI-CET | MedLadder',
    ogTitle: 'Cardiology Clinical Cases — STEMI, AF, dissection & more',
    h1: 'Cardiology',
    desc: '{total} cardiology clinical cases with explained answers: STEMI, aortic dissection, AF, heart failure and endocarditis. For NEET PG & INI-CET. {free} free.',
    keywords: 'cardiology clinical cases, cardiology case based questions, cardiology clinical vignettes NEET PG, STEMI case MCQ, aortic dissection case, atrial fibrillation case, heart failure case, infective endocarditis case, INI-CET cardiology',
    focusTitle: 'What these cardiology cases test',
    focus: 'Most cardiology vignettes turn on one decision made under time pressure. You choose primary PCI for STEMI, spot right ventricular infarction before nitrates drop the pressure, slow the heart with a beta-blocker before any vasodilator in aortic dissection, and take three sets of blood cultures before antibiotics in suspected endocarditis. The Advanced cases go further: low-flow, low-gradient aortic stenosis, mechanical complications after MI, anticoagulation with a mechanical valve in pregnancy, and exertional syncope in a young athlete.',
    faqs: [
      ['Which cardiology topics come up most in NEET PG clinical cases?', 'Acute coronary syndromes, arrhythmias, heart failure, valve disease and infective endocarditis come up most. The question usually asks for the next step: primary PCI or thrombolysis, cardioversion or rate control, which drug goes first. Every case on this page is built around one of those decisions.'],
      ['Do the cardiology cases include ECG findings?', 'Yes. ECG findings are written into the vignette, such as ST elevation in V1 to V4, peaked T waves or an irregular broad-complex tachycardia, and you decide what they mean for management. The explanation then sets out why.'],
      ['Are these cases hard enough for INI-CET cardiology?', 'The Advanced cases are written at INI-CET and NEET SS level, with exceptions and second-line decisions such as low-gradient aortic stenosis or a ventricular septal rupture after MI. Start with the Core cases and move up once those feel routine.'],
    ],
  },
  respiratory: {
    title: 'Respiratory Medicine Clinical Cases for NEET PG | MedLadder',
    ogTitle: 'Respiratory Clinical Cases — COPD, asthma, PE, pneumonia',
    h1: 'Respiratory',
    desc: '{total} respiratory medicine cases with explained answers: COPD, acute asthma, pneumonia, PE, pneumothorax and lung cancer. NEET PG & INI-CET. {free} free.',
    keywords: 'respiratory medicine clinical cases, pulmonology case based questions, COPD exacerbation case, acute asthma case, pulmonary embolism case, pneumonia CURB-65 case, pneumothorax case, ABG interpretation MCQ, NEET PG respiratory',
    focusTitle: 'What these respiratory cases test',
    focus: 'Respiratory cases reward reading the blood gas and the bedside signs together. You decide when a COPD exacerbation with a pH of 7.28 needs non-invasive ventilation, recognise the silent chest of life-threatening asthma, grade pneumonia severity to choose between home and the ICU, and work up a suspected pulmonary embolism in the right order. Advanced cases cover home oxygen criteria, severe asthma with nasal polyps that needs biologic therapy, mediastinal masses, occupational lung disease and lung cancer screening.',
    faqs: [
      ['Which respiratory topics matter most for NEET PG?', 'COPD, asthma, pneumonia, pulmonary embolism, pleural effusion, pneumothorax and tuberculosis. The cases on this page focus on management decisions such as escalating oxygen and ventilation, choosing antibiotics and picking the right first investigation.'],
      ['Do the cases cover arterial blood gas interpretation?', 'Yes. Several cases give an ABG and ask you to act on it, for example deciding on non-invasive ventilation for hypercapnic respiratory failure in COPD. The explanation walks through the gas step by step.'],
      ['How are Core and Advanced respiratory cases different?', 'Core cases cover the emergencies every intern must handle, such as acute asthma, COPD exacerbations and tension pneumothorax. Advanced cases test the finer points: home oxygen criteria, interstitial lung disease, sarcoidosis and lung cancer staging.'],
    ],
  },
  neurology: {
    title: 'Neurology Clinical Cases for NEET PG & INI-CET | MedLadder',
    ogTitle: 'Neurology Clinical Cases — stroke, seizures, GBS & coma',
    h1: 'Neurology',
    desc: '{total} neurology clinical cases with explained answers: stroke thrombolysis, status epilepticus, GBS, myasthenia and coma. For NEET PG & INI-CET. {free} free.',
    keywords: 'neurology clinical cases, neurology case based questions, stroke thrombolysis case, alteplase window MCQ, status epilepticus case, Guillain-Barre syndrome case, myasthenia gravis case, subarachnoid haemorrhage case, NEET PG neurology',
    focusTitle: 'What these neurology cases test',
    focus: 'Neurology vignettes are about timing and localisation. You decide whether a stroke patient is inside the thrombolysis window, bring the blood pressure below 185/110 before alteplase, reverse anticoagulation in an intracerebral bleed, and work through status epilepticus drug by drug. Other cases cover Guillain–Barré syndrome, myasthenic crisis, meningitis, cerebral venous thrombosis and brain death testing. Advanced cases add hyponatraemia after subarachnoid haemorrhage, demyelination and the neurocutaneous syndromes.',
    faqs: [
      ['Which neurology topics are most tested in NEET PG?', 'Stroke and TIA, seizures, intracranial haemorrhage, meningitis, Guillain–Barré syndrome, myasthenia gravis and raised intracranial pressure. Questions usually test what to do first, which is how these cases are written.'],
      ['Do the cases cover the thrombolysis window and contraindications?', 'Yes. Several stroke cases ask whether to give alteplase, based on time from onset, blood pressure, anticoagulation and imaging, and the explanations set out the cut-offs you need for the exam.'],
      ['Are there advanced neurology cases for INI-CET and NEET SS?', 'Yes. The Advanced cases cover cerebral salt wasting versus SIADH after a bleed, demyelinating disease, motor neuron disease and the less common emergencies that INI-CET likes to test.'],
    ],
  },
  'gastro-hepatobiliary': {
    title: 'GI & Hepatology Clinical Cases for NEET PG | MedLadder',
    ogTitle: 'GI & Liver Clinical Cases — GI bleed, pancreatitis, cirrhosis',
    h1: 'GI &amp; Hepatology',
    desc: '{total} gastroenterology and hepatology cases with explained answers: upper GI bleed, pancreatitis, cirrhosis, SBP and bowel obstruction. NEET PG. {free} free.',
    keywords: 'gastroenterology clinical cases, hepatology case based questions, upper GI bleed case, variceal bleeding case, acute pancreatitis case, cirrhosis SBP case, bowel obstruction case, mesenteric ischaemia case, NEET PG GI surgery medicine',
    focusTitle: 'What these GI and liver cases test',
    focus: 'GI and liver cases mostly test the order of priorities. In an upper GI bleed you protect the airway, resuscitate, start octreotide and antibiotics in cirrhosis, and only then scope. You give aggressive fluids early in pancreatitis, tap the ascites of a febrile cirrhotic patient to exclude SBP, and pick conservative treatment or the operating theatre in bowel obstruction. Advanced cases cover Barrett surveillance, false-negative H. pylori tests, drug-induced liver injury and hepatobiliary cancers.',
    faqs: [
      ['Which GI topics are most important for NEET PG?', 'Upper GI bleeding, acute pancreatitis, cirrhosis and its complications, the acute abdomen, inflammatory bowel disease and viral hepatitis. These cases cover both the medicine and the surgical decisions.'],
      ['Do the cases include surgical gastroenterology?', 'Yes. Bowel obstruction, mesenteric ischaemia, perforation, cholecystitis and cholangitis appear alongside the medical topics, so you practise deciding when a patient needs theatre.'],
      ['How do these cases help with liver disease questions?', 'They follow a cirrhotic patient through the complications the exam tests most: variceal bleeding, spontaneous bacterial peritonitis, hepatorenal syndrome and encephalopathy, each with the first-line management explained.'],
    ],
  },
  'renal-electrolytes': {
    title: 'Nephrology Clinical Cases for NEET PG & INI-CET | MedLadder',
    ogTitle: 'Nephrology & Electrolyte Cases — AKI, hyperkalaemia, acid–base',
    h1: 'Nephrology &amp; Electrolytes',
    desc: '{total} nephrology and electrolyte cases with explained answers: AKI, hyperkalaemia, hyponatraemia, acid–base and glomerular disease. NEET PG. {free} free.',
    keywords: 'nephrology clinical cases, renal case based questions, hyperkalaemia management case, hyponatraemia case, acid base MCQ, acute kidney injury case, nephrotic syndrome case, glomerulonephritis case, NEET PG nephrology',
    focusTitle: 'What these renal and electrolyte cases test',
    focus: 'Renal cases are built around numbers you have to act on. You give calcium gluconate first when hyperkalaemia changes the ECG, correct sodium without causing osmotic demyelination, work out an anion gap and decide whether the kidney injury is pre-renal, renal or obstructive. Further cases cover nephrotic and nephritic syndromes, stones, urinary infection and dialysis. Advanced cases include contrast nephropathy, calciphylaxis, renal vein thrombosis, transplant rejection and anti-GBM disease.',
    faqs: [
      ['Which renal topics are most tested in NEET PG?', 'Acute kidney injury, potassium and sodium disorders, acid–base problems, nephrotic and nephritic syndromes, and urinary tract infection. Electrolyte emergencies are especially common because they test management as well as diagnosis.'],
      ['Do the cases teach acid–base interpretation?', 'Yes. Cases give you the gas and the electrolytes, and the explanation goes through the anion gap and compensation step by step, the same approach the exam expects.'],
      ['Are there Advanced cases for INI-CET nephrology?', 'Yes. They cover transplant medicine, glomerular disease with pulmonary haemorrhage, renal tubular acidosis and the drug-related kidney injuries that INI-CET favours.'],
    ],
  },
  'endocrine-metabolic': {
    title: 'Endocrinology Clinical Cases for NEET PG & INI-CET | MedLadder',
    ogTitle: 'Endocrinology Clinical Cases — DKA, thyroid, adrenal, calcium',
    h1: 'Endocrinology',
    desc: '{total} endocrinology cases with explained answers: DKA, thyroid storm, SIADH, adrenal crisis, hypercalcaemia and diabetes. For NEET PG & INI-CET. {free} free.',
    keywords: 'endocrinology clinical cases, endocrine case based questions, DKA management case, thyroid storm case, SIADH hyponatraemia case, adrenal insufficiency case, hyperparathyroidism case, diabetes MCQ NEET PG, INI-CET endocrine',
    focusTitle: 'What these endocrine cases test',
    focus: 'Endocrine cases follow the hormone through to treatment. You run DKA in the right order, holding insulin while the potassium is low, give hypertonic saline for hyponatraemia with seizures, treat adrenal crisis before the cortisol result comes back, and rule out familial hypocalciuric hypercalcaemia before sending a patient for parathyroid surgery. Advanced cases cover the dawn phenomenon versus Somogyi, MODY, Charcot foot, SGLT2-associated euglycaemic DKA and factitious hypoglycaemia.',
    faqs: [
      ['Which endocrine topics come up most in NEET PG?', 'Diabetic emergencies, thyroid disorders, adrenal disease, calcium disorders, pituitary tumours and sodium problems such as SIADH and diabetes insipidus. The cases cover diagnosis, then the first and next steps in management.'],
      ['Do the cases cover diabetes management in depth?', 'Yes. They cover DKA and HHS, hypoglycaemia, insulin adjustment, monogenic diabetes and diabetic foot complications, with explanations of the thresholds the exam uses.'],
      ['Are there cases on endocrine tumours?', 'Yes. They cover phaeochromocytoma, MEN syndromes, pituitary adenomas and thyroid nodules, with a focus on which test to order first and what to do before surgery.'],
    ],
  },
  'haematology-oncology': {
    title: 'Haematology & Oncology Clinical Cases for NEET PG | MedLadder',
    ogTitle: 'Haematology & Oncology Cases — anaemia, leukaemia, DIC',
    h1: 'Haematology &amp; Oncology',
    desc: '{total} haematology and oncology cases with explained answers: anaemias, leukaemia, lymphoma, myeloma, DIC and transfusion. For NEET PG & INI-CET. {free} free.',
    keywords: 'haematology clinical cases, hematology case based questions, anaemia case MCQ, leukaemia case, lymphoma case, multiple myeloma case, DIC case, thalassaemia case, oncologic emergencies, NEET PG haematology',
    focusTitle: 'What these haematology and oncology cases test',
    focus: 'Haematology cases start with the blood film and end with treatment. You separate iron deficiency from anaemia of chronic disease, recognise haemolysis and its cause, manage a sickle cell crisis and an aplastic crisis, and act on DIC, thrombocytopenia and transfusion reactions. The oncology cases cover leukaemias, lymphomas, myeloma, tumour lysis and other oncologic emergencies. Many of the Advanced cases are INI-CET style: PNH, Fanconi anaemia, nitrous oxide B12 deficiency and iron overload in thalassaemia.',
    faqs: [
      ['Which haematology topics matter most for NEET PG?', 'Anaemias, haemolytic disorders, bleeding and clotting disorders, leukaemias, lymphomas and myeloma. Questions often give you a blood count or film and ask for the diagnosis or the next step, and these cases work the same way.'],
      ['Do the cases include oncologic emergencies?', 'Yes. Tumour lysis syndrome, spinal cord compression and hypercalcaemia of malignancy are covered, along with chemotherapy toxicity and paraneoplastic syndromes.'],
      ['Why are most haematology cases Advanced?', 'Haematology questions in INI-CET and NEET SS go deep into rare anaemias and marrow failure, so most cases here are written at that level. The Core cases cover the essentials first.'],
    ],
  },
  'infectious-disease': {
    title: 'Infectious Disease Clinical Cases for NEET PG & FMGE | MedLadder',
    ogTitle: 'Infectious Disease Cases — malaria, dengue, sepsis, HIV, TB',
    h1: 'Infectious Disease',
    desc: '{total} infectious disease cases with explained answers: sepsis, malaria, dengue, typhoid, scrub typhus, HIV and TB. NEET PG, FMGE & INI-CET. {free} free.',
    keywords: 'infectious disease clinical cases, tropical medicine case questions, malaria case MCQ, dengue shock case, typhoid case, scrub typhus case, leptospirosis case, HIV opportunistic infection case, sepsis case, FMGE infectious diseases',
    focusTitle: 'What these infectious disease cases test',
    focus: 'These cases are written for Indian practice. You manage septic shock past the first litre of fluid, treat severe falciparum and vivax malaria (including in pregnancy), manage the critical phase of dengue, recognise the eschar of scrub typhus and the Jarisch–Herxheimer reaction in leptospirosis, and spot typhoid perforation in the third week of fever. HIV cases cover cryptococcal meningitis and Pneumocystis pneumonia. Other cases cover tetanus, leprosy, zoonoses and the national immunisation schedule.',
    faqs: [
      ['Which infectious diseases are most tested in NEET PG and FMGE?', 'Malaria, dengue, typhoid, tuberculosis, HIV and its opportunistic infections, sepsis and meningitis. FMGE in particular tests tropical infections, so these cases follow Indian treatment guidelines.'],
      ['Do the cases follow Indian guidelines?', 'Yes, where it matters. Malaria, dengue fluid management and the immunisation schedule follow the national programmes, and the explanations say so when international guidance differs.'],
      ['Are there cases on antibiotic choice and resistance?', 'Yes. They cover empirical antibiotics for sepsis and meningitis, hospital-acquired and resistant infections, and the antimicrobial facts the exam keeps coming back to.'],
    ],
  },
  'musculoskeletal-rheumatology': {
    title: 'Rheumatology & Ortho Clinical Cases for NEET PG | MedLadder',
    ogTitle: 'Rheumatology & Ortho Cases — RA, gout, lupus, vasculitis',
    h1: 'Rheumatology &amp; Ortho',
    desc: '{total} rheumatology and orthopaedic cases with explained answers: RA, gout, lupus, vasculitis, septic arthritis and fractures. For NEET PG & INI-CET. {free} free.',
    keywords: 'rheumatology clinical cases, orthopaedics case based questions, rheumatoid arthritis case, gout management case, SLE case, vasculitis case, septic arthritis case, bone tumour case, fracture MCQ NEET PG',
    focusTitle: 'What these rheumatology and orthopaedic cases test',
    focus: 'Rheumatology cases test pattern recognition, then safe prescribing. You aspirate a hot joint before calling it gout, treat a flare with steroids in kidney disease, step up rheumatoid arthritis to a biologic once methotrexate has failed, and avoid the allopurinol–azathioprine interaction. The vasculitis cases run from giant cell arteritis to ANCA disease. Orthopaedic cases cover fractures, osteomyelitis, bone tumours and back pain red flags. Advanced cases include psoriatic arthritis, axial spondyloarthritis and antiphospholipid syndrome.',
    faqs: [
      ['Which rheumatology topics are most tested in NEET PG?', 'Rheumatoid arthritis, gout and pseudogout, SLE, spondyloarthritis, vasculitis and septic arthritis. These cases cover diagnosis from the clinical picture and the first-line drug, including when it is unsafe.'],
      ['Do the cases include orthopaedics?', 'Yes. Fractures and dislocations, osteomyelitis, bone tumours, osteoporosis and sports injuries are covered alongside rheumatology.'],
      ['Are drug side effects and interactions covered?', 'Yes. Several cases test DMARD and biologic safety, steroid use in kidney disease, and dangerous interactions such as allopurinol with azathioprine.'],
    ],
  },
  'obstetrics-gynaecology': {
    title: 'OBG Clinical Cases for NEET PG & INI-CET | MedLadder',
    ogTitle: 'Obstetrics & Gynaecology Cases — PPH, preeclampsia, ectopic',
    h1: 'Obstetrics &amp; Gynaecology',
    desc: '{total} OBG clinical cases with explained answers: PPH, preeclampsia, ectopic pregnancy, preterm labour, contraception and gynae cancers. NEET PG. {free} free.',
    keywords: 'OBG clinical cases, obstetrics and gynaecology case based questions, postpartum haemorrhage case, preeclampsia magnesium sulfate case, ectopic pregnancy case, preterm labour case, gestational diabetes case, cervical cancer screening, NEET PG OBG',
    focusTitle: 'What these OBG cases test',
    focus: 'Obstetric cases test the steps of an emergency in order. You work through atonic postpartum haemorrhage from massage and oxytocin to second-line uterotonics, chosen around contraindications, give magnesium sulfate and control blood pressure in severe preeclampsia, treat a ruptured ectopic pregnancy and time delivery in preterm rupture of membranes. The gynaecology cases cover postmenopausal bleeding, PID, contraception, infertility and the gynaecological cancers. Advanced cases include cell-free DNA screening, cervical insufficiency and persistent trophoblastic disease.',
    faqs: [
      ['Which OBG topics are most important for NEET PG?', 'Postpartum haemorrhage, hypertensive disorders of pregnancy, ectopic pregnancy, antepartum haemorrhage, preterm labour, diabetes in pregnancy and contraception. OBG is a high-weightage subject, and every case here centres on a management decision.'],
      ['Do the cases cover both obstetrics and gynaecology?', 'Yes. Roughly half cover pregnancy and labour and half cover gynaecology, including menstrual disorders, infections, infertility, menopause and the gynaecological cancers.'],
      ['Are the obstetric cases based on Indian practice?', 'They follow standard guidance used in Indian exams, such as magnesium sulfate for eclampsia prophylaxis and the uterotonic sequence for PPH, and the explanations point out where exam answers depend on the guideline.'],
    ],
  },
  'paediatrics-neonatology': {
    title: 'Paediatrics Clinical Cases for NEET PG & INI-CET | MedLadder',
    ogTitle: 'Paediatrics Clinical Cases — neonates, dehydration, emergencies',
    h1: 'Paediatrics',
    desc: '{total} paediatrics and neonatology cases with explained answers: neonatal sepsis, jaundice, dehydration, emergencies and milestones. NEET PG & INI-CET. {free} free.',
    keywords: 'paediatrics clinical cases, pediatrics case based questions, neonatology case MCQ, neonatal sepsis case, neonatal jaundice case, dehydration management child, paediatric emergencies case, developmental milestones MCQ, NEET PG paediatrics',
    focusTitle: 'What these paediatric cases test',
    focus: 'Paediatric cases are about doses, thresholds and age. You resuscitate a newborn who is not breathing, start ampicillin and gentamicin for neonatal sepsis, work out which jaundiced baby needs urgent investigation, give a 20 mL/kg bolus to a shocked infant, and remove an inhaled foreign body by rigid bronchoscopy. Others cover milestones, immunisation, severe acute malnutrition, Kawasaki disease and intussusception. Advanced cases include hypoxic-ischaemic encephalopathy, congenital diaphragmatic hernia and ROP screening criteria.',
    faqs: [
      ['Which paediatric topics are most tested in NEET PG?', 'Neonatology (resuscitation, jaundice and sepsis), dehydration, respiratory infections, developmental milestones, immunisation, malnutrition and paediatric emergencies. The cases follow the IAP and national programme guidance the exam uses.'],
      ['Is there a separate set of neonatology cases?', 'Neonatology is built in. Resuscitation, prematurity, respiratory distress, jaundice, hypoglycaemia and sepsis in the newborn each have their own cases, and many of the Advanced cases are neonatal.'],
      ['Do the cases cover paediatric surgery?', 'Yes. Intussusception, pyloric stenosis, foreign-body aspiration and the other common surgical emergencies in children are covered.'],
    ],
  },
  psychiatry: {
    title: 'Psychiatry Clinical Cases for NEET PG & INI-CET | MedLadder',
    ogTitle: 'Psychiatry Clinical Cases — psychosis, mood, withdrawal, MHCA',
    h1: 'Psychiatry',
    desc: '{total} psychiatry cases with explained answers: schizophrenia, bipolar, depression, alcohol withdrawal, delirium and the MHCA 2017. For NEET PG. {free} free.',
    keywords: 'psychiatry clinical cases, psychiatry case based questions, schizophrenia case MCQ, bipolar mania case, depression ECT case, alcohol withdrawal delirium tremens case, NMS case, delirium management, Mental Healthcare Act 2017 MCQ, NEET PG psychiatry',
    focusTitle: 'What these psychiatry cases test',
    focus: 'Psychiatry vignettes ask you to name the disorder and choose what to do next. You treat delirium tremens with benzodiazepines, manage delirium without drugs first, recognise neuroleptic malignant syndrome and lithium toxicity, decide when a suicidal patient needs admission, and choose ECT for psychotic depression with refusal to eat or drink. A large set covers mental health law, capacity and confidentiality, along with opioid overdose and stimulant intoxication. Advanced cases include shared psychotic disorder and treatment-resistant illness.',
    faqs: [
      ['Which psychiatry topics are most tested in NEET PG?', 'Schizophrenia, mood disorders, substance use and withdrawal, anxiety disorders, delirium and dementia, and the side effects of psychiatric drugs. These cases focus on telling apart disorders that look alike, and on management.'],
      ['Do the cases cover the Mental Healthcare Act and legal psychiatry?', 'Yes. Several cases cover capacity, involuntary admission, confidentiality and forensic questions, which come up often and are easy marks once the rules are clear.'],
      ['Are psychiatric drug side effects included?', 'Yes. Cases cover neuroleptic malignant syndrome, serotonin syndrome, lithium toxicity and the metabolic effects of antipsychotics, with what to do in each.'],
    ],
  },
  'emergency-critical-care': {
    title: 'Emergency Medicine & ICU Clinical Cases for NEET PG | MedLadder',
    ogTitle: 'Emergency & ICU Clinical Cases — trauma, poisoning, ACLS',
    h1: 'Emergency &amp; Critical Care',
    desc: '{total} emergency medicine and ICU cases with explained answers: trauma (ATLS), poisoning, snake bite, anaphylaxis, burns, ventilation and ACLS. {free} free.',
    keywords: 'emergency medicine clinical cases, critical care case based questions, ATLS trauma case, FAST positive laparotomy case, organophosphate poisoning case, snake bite case, anaphylaxis case, burns fluid case, ventilator MCQ, NEET PG emergency',
    focusTitle: 'What these emergency and ICU cases test',
    focus: 'Emergency cases test the primary survey and the decisions made in the first ten minutes. You send an unstable patient with a positive FAST scan to theatre, relieve tamponade, treat organophosphate poisoning and snake envenomation, give intramuscular adrenaline for anaphylaxis, and intubate early when a burn has damaged the airway. ICU cases cover sedation, fluid responsiveness and ventilator alarms. Advanced cases include cardiac arrest in pregnancy, choosing a paralytic in crush injury, and raised intracranial pressure after head injury.',
    faqs: [
      ['Which emergency medicine topics are most tested?', 'Trauma (ATLS), shock, poisoning, envenomation, anaphylaxis, burns, cardiac arrest and airway management. Most questions ask what to do first, and these cases are built the same way.'],
      ['Do the cases cover Indian toxicology such as organophosphate and snake bite?', 'Yes. Organophosphate poisoning, snake envenomation and drug overdose are covered, with antidotes and supportive care laid out as Indian exams test them.'],
      ['Are ICU and ventilator questions included?', 'Yes. Cases cover mechanical ventilation, including reading peak and plateau pressures, as well as sepsis resuscitation, sedation and organ support. That makes them useful for INI-CET and NEET SS anaesthesia and critical care.'],
    ],
  },
};
