
UPDATE public.roadmaps SET end_date = '2026-09-04', updated_at = now() WHERE id = 'dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7';

DELETE FROM public.roadmap_items WHERE roadmap_id = 'dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7';

INSERT INTO public.roadmap_items (roadmap_id, label, start_date, end_date, color, sort_order, notes, assigned_team, is_milestone) VALUES
-- WEEK 1: Strip Out & Site Clearance (Jul 27 - Jul 31)
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Site set up, welfare, protection','2026-07-27','2026-07-27','#6b7280',10,'W1 Strip Out. 0.5 day. Multi Trade.','Multi Trade',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Clear entire property','2026-07-27','2026-07-27','#64748b',20,'W1 Strip Out. 0.5 day. Labourers.','Labourers',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Remove wallpaper throughout','2026-07-28','2026-07-28','#64748b',30,'W1 Strip Out. 1 day. Labourers.','Labourers',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Remove skirting boards','2026-07-28','2026-07-28','#92400e',40,'W1 Strip Out. 0.5 day. Carpenter.','Carpenter',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Remove architraves','2026-07-29','2026-07-29','#92400e',50,'W1 Strip Out. 0.5 day. Carpenter.','Carpenter',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Remove kitchen','2026-07-29','2026-07-29','#16a34a',60,'W1 Strip Out. 1 day. Kitchen Team.','Kitchen Team',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Remove wet room','2026-07-30','2026-07-30','#2563eb',70,'W1 Strip Out. 1 day. Bathroom Team.','Bathroom Team',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Lift vinyl flooring','2026-07-30','2026-07-30','#64748b',80,'W1 Strip Out. 0.5 day. Labourers.','Labourers',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Remove damaged plaster/render','2026-07-31','2026-07-31','#475569',90,'W1 Strip Out. 1 day. Plasterers.','Plasterers',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Remove doors scheduled for replacement','2026-07-31','2026-07-31','#92400e',100,'W1 Strip Out. 0.5 day. Carpenter.','Carpenter',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Prepare kitchen window wall','2026-07-31','2026-07-31','#78716c',110,'W1 Strip Out. 0.5 day. Builder.','Builder',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Bathroom wall preparation','2026-07-31','2026-07-31','#78716c',120,'W1 Strip Out. 0.5 day. Builder.','Builder',false),

-- WEEK 2: Building Repairs (Aug 3 - Aug 7) + Plastering start
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Structural timber repairs','2026-08-03','2026-08-03','#92400e',130,'W2 Building Repairs. 1 day. Carpenter.','Carpenter',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Kitchen window wall repair','2026-08-03','2026-08-03','#78716c',140,'W2 Building Repairs. 0.5 day. Builder.','Builder',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Bathroom wall repair','2026-08-04','2026-08-04','#78716c',150,'W2 Building Repairs. 0.5 day. Builder.','Builder',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Repair external window reveals','2026-08-04','2026-08-04','#78716c',160,'W2 Building Repairs. 0.5 day. Builder.','Builder',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Make good around windows','2026-08-05','2026-08-05','#78716c',170,'W2 Building Repairs. 0.5 day. Builder.','Builder',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Electrical tidy works (switches, sockets, cable fixing)','2026-08-05','2026-08-05','#d97706',180,'W2 Building Repairs. 1 day. Electrician.','Electrician',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Check shower cable suitable for 8.7kW shower','2026-08-05','2026-08-05','#dc2626',190,'W2 Building Repairs. 2 hours. Electrician. COMPLIANCE / SAFETY CHECK — must confirm existing cable can support 8.7kW shower before install.','Electrician',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Replace window handles where required','2026-08-06','2026-08-06','#92400e',200,'W2 Building Repairs. 2 hours. Carpenter.','Carpenter',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Install replacement fans','2026-08-06','2026-08-06','#d97706',210,'W2 Building Repairs. 0.5 day. Electrician.','Electrician',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Bonding repairs','2026-08-07','2026-08-07','#475569',220,'W2-3 Plastering. 1 day. Plasterers.','Plasterers',false),

-- WEEK 3: Plastering completion + Drying (Aug 10 - Aug 20)
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Full skim to all walls','2026-08-10','2026-08-11','#475569',230,'W3 Plastering. 2 days. Plasterers.','Plasterers',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Skim all ceilings','2026-08-12','2026-08-12','#475569',240,'W3 Plastering. 1 day. Plasterers.','Plasterers',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Additional plaster coats where required','2026-08-13','2026-08-13','#475569',250,'W3 Plastering. 1 day. Plasterers.','Plasterers',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Plaster drying period (5 working days — CRITICAL)','2026-08-14','2026-08-20','#dc2626',260,'CRITICAL HOLD POINT. Natural drying. PDF note: "This drying period is critical and should not be shortened."','Natural Drying',true),

-- WEEK 4: Carpentry First Fix (Aug 20 - Aug 21)
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Install new architraves','2026-08-21','2026-08-21','#92400e',270,'W3-4 Carpentry First Fix. 1 day. Carpenter.','Carpenter',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Install new skirting boards','2026-08-21','2026-08-21','#92400e',280,'W3-4 Carpentry First Fix. 1 day. Carpenter.','Carpenter',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Install 3 internal doors','2026-08-24','2026-08-24','#92400e',290,'Carpentry First Fix. 1 day. Carpenter.','Carpenter',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Install composite front door','2026-08-24','2026-08-24','#92400e',300,'Carpentry First Fix. 0.5 day. Door Team.','Door Team',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Install kitchen FD30 fire door','2026-08-25','2026-08-25','#b91c1c',310,'Carpentry First Fix. 0.5 day. Carpenter. FIRE COMPLIANCE — FD30 rated.','Carpenter',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Install dining room FD30 fire door','2026-08-25','2026-08-25','#b91c1c',320,'Carpentry First Fix. 0.5 day. Carpenter. FIRE COMPLIANCE — FD30 rated.','Carpenter',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Door adjustments & ironmongery','2026-08-25','2026-08-25','#92400e',330,'Carpentry First Fix. 0.5 day. Carpenter.','Carpenter',false),

-- WEEK 5: Kitchen Installation (Aug 24 - Aug 28)
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Install kitchen units','2026-08-24','2026-08-25','#16a34a',340,'W4 Kitchen. 2 days. Kitchen Fitters.','Kitchen Fitters',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Worktops','2026-08-26','2026-08-26','#16a34a',350,'W4 Kitchen. 0.5 day. Kitchen Fitters.','Kitchen Fitters',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Sink & plumbing','2026-08-26','2026-08-26','#0d9488',360,'W4 Kitchen. 0.5 day. Plumber.','Plumber',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Appliances reconnect','2026-08-27','2026-08-27','#d97706',370,'W4 Kitchen. 0.5 day. Electrician.','Electrician',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Kitchen sealants & finishing','2026-08-27','2026-08-27','#16a34a',380,'W4 Kitchen. 0.5 day. Kitchen Team.','Kitchen Team',false),

-- WEEK 5: Bathroom / Wet Room (Aug 24 - Aug 28)
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Prepare floor (bathroom)','2026-08-24','2026-08-24','#2563eb',390,'W4 Wet Room. 0.5 day. Bathroom Team.','Bathroom Team',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Self-levelling compound (bathroom)','2026-08-24','2026-08-24','#7c3aed',400,'W4 Wet Room. 0.5 day. Flooring Contractor.','Flooring Contractor',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Wet room installation','2026-08-25','2026-08-26','#2563eb',410,'W4 Wet Room. 2 days. Bathroom Team.','Bathroom Team',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Wall tiling','2026-08-27','2026-08-28','#7c3aed',420,'W4 Wet Room. 2 days. Tiler.','Tiler',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Shower installation','2026-08-28','2026-08-28','#d97706',430,'W4 Wet Room. 0.5 day. Electrician.','Electrician',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Bathroom lighting','2026-08-28','2026-08-28','#d97706',440,'W4 Wet Room. 2 hours. Electrician.','Electrician',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Bathroom sealants & testing','2026-08-28','2026-08-28','#2563eb',450,'W4 Wet Room. 0.5 day. Bathroom Team.','Bathroom Team',false),

-- WEEK 6: Flooring (Aug 31 - Sep 2)
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Floor preparation','2026-08-31','2026-08-31','#7c3aed',460,'W5 Flooring. 0.5 day. Flooring Contractor.','Flooring Contractor',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Self levelling compound (Kitchen)','2026-08-31','2026-08-31','#7c3aed',470,'W5 Flooring. 0.5 day. Flooring Contractor.','Flooring Contractor',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Self levelling compound (Bathroom)','2026-08-31','2026-08-31','#7c3aed',480,'W5 Flooring. 0.5 day. Flooring Contractor.','Flooring Contractor',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Install Polysafe flooring — Kitchen','2026-09-01','2026-09-01','#7c3aed',490,'W5 Flooring. 0.5 day. Flooring Contractor. Product: Polysafe.','Flooring Contractor',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Install Polysafe flooring — Bathroom','2026-09-01','2026-09-01','#7c3aed',500,'W5 Flooring. 0.5 day. Flooring Contractor. Product: Polysafe.','Flooring Contractor',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Weld joints & finish flooring','2026-09-02','2026-09-02','#7c3aed',510,'W5 Flooring. 0.5 day. Flooring Contractor.','Flooring Contractor',false),

-- WEEK 6: Decoration (Aug 31 - Sep 3)
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Mist coat new plaster','2026-08-31','2026-08-31','#db2777',520,'W5-6 Decoration. 1 day. Decorators.','Decorators',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Prepare woodwork','2026-08-31','2026-08-31','#db2777',530,'W5-6 Decoration. 0.5 day. Decorators.','Decorators',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Walls first coat','2026-09-01','2026-09-01','#db2777',540,'W5-6 Decoration. 1 day. Decorators.','Decorators',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Ceilings first coat','2026-09-01','2026-09-01','#db2777',550,'W5-6 Decoration. 0.5 day. Decorators.','Decorators',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Woodwork undercoat','2026-09-02','2026-09-02','#db2777',560,'W5-6 Decoration. 0.5 day. Decorators.','Decorators',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Final wall coat','2026-09-02','2026-09-02','#db2777',570,'W5-6 Decoration. 1 day. Decorators.','Decorators',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Final ceiling coat','2026-09-03','2026-09-03','#db2777',580,'W5-6 Decoration. 0.5 day. Decorators.','Decorators',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Final gloss/satin woodwork','2026-09-03','2026-09-03','#db2777',590,'W5-6 Decoration. 1 day. Decorators.','Decorators',false),

-- WEEK 6: Final Works (Sep 3 - Sep 4)
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Silicone throughout','2026-09-03','2026-09-03','#6b7280',600,'W6 Final Works. 0.5 day. Multi Trade.','Multi Trade',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Final electrical testing','2026-09-04','2026-09-04','#d97706',610,'W6 Final Works. 2 hours. Electrician. COMPLIANCE.','Electrician',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Final door adjustments','2026-09-04','2026-09-04','#92400e',620,'W6 Final Works. 2 hours. Carpenter.','Carpenter',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Kitchen snagging','2026-09-04','2026-09-04','#16a34a',630,'W6 Final Works. 2 hours. Kitchen Team.','Kitchen Team',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Bathroom snagging','2026-09-04','2026-09-04','#2563eb',640,'W6 Final Works. 2 hours. Bathroom Team.','Bathroom Team',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Deep clean','2026-09-04','2026-09-04','#059669',650,'W6 Final Works. 1 day. Cleaning Team.','Cleaning Team',false),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Site Manager QA Inspection','2026-09-04','2026-09-04','#0ea5e9',660,'W6 Final Works. 0.5 day. Site Manager. QA gate before client inspection.','Site Manager',true),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Client / NPH Inspection','2026-09-04','2026-09-04','#0ea5e9',670,'W6 Final Works. 0.5 day. Site Manager. Handover inspection.','Site Manager',true),
('dd294e1d-de5a-4de0-bd46-4e4e7eefdcc7','Snag rectification','2026-09-04','2026-09-04','#6b7280',680,'W6 Final Works. 1 day. Multi Trade. Post-inspection remediation before handover.','Multi Trade',false);
