/* ============================================================================
   PRC.JS — Capa de Plan Regulador Comunal para Terrenos (Patagonland)
   ----------------------------------------------------------------------------
   Módulo autocontenido. Se engancha solo al app existente:
     - Inyecta su propio CSS
     - Agrega el botón "PRC" a los controles del mapa
     - Crea su propio panel flotante
     - Se cuelga de fillDetail() para mostrar la zona de cada terreno

   ÚNICO cambio necesario en index.html:
     <script src="prc.js"></script>   (justo antes de </body>)

   DATOS: prc-lascondes.geojson en la raíz del repo.

   FUENTES:
     - Geometría: Geoportal MINVU / IDE Chile (capa PRC Las Condes)
     - Normas:    Ordenanza PRC Las Condes, Texto Refundido incl. Mod. N°11
                  (Diario Oficial, octubre 2021), Artículo 38.

   ============================================================================
   CÓMO AGREGAR OTRA COMUNA MÁS ADELANTE:
     1. Bajar su GeoJSON del portal MINVU → guardarlo como prc-<comuna>.geojson
     2. Agregarlo a PRC_FUENTES abajo
     3. Cargar sus normas de edificación en PRC_NORMAS (cada comuna tiene sus
        propias siglas; ojo con colisiones — si se repiten, prefijar la comuna)
   ============================================================================ */

(function(){
'use strict';

/* ===========================================================================
   1. CONFIGURACIÓN
   =========================================================================== */

// Comunas que tienen PRC cargado. Si el terreno no está acá, no se busca zona.
var PRC_FUENTES = {
  'Las Condes': 'prc-lascondes.geojson'
};

// Familias de zona → color en el mapa.
// Ordenadas de mayor a menor intensidad de edificación.
var PRC_FAMILIAS = {
  alta:         { label:'Edificación Alta',        color:'#B03060', orden:1 },
  media:        { label:'Edificación Media',       color:'#E8833A', orden:2 },
  baja:         { label:'Edificación Baja',        color:'#D4AF37', orden:3 },
  equipamiento: { label:'Equipamiento',            color:'#2D7A8C', orden:4 },
  verde:        { label:'Áreas verdes / Parques',  color:'#3CA06E', orden:5 },
  patrimonial:  { label:'Patrimonial',             color:'#8A6D3B', orden:6 },
  otro:         { label:'Sin clasificar',          color:'#9A948A', orden:7 }
};

/* ---------------------------------------------------------------------------
   NORMAS URBANÍSTICAS POR ZONA DE EDIFICACIÓN
   ---------------------------------------------------------------------------
   Cada zona tiene una Tabla A) Base y, en muchos casos, tablas de
   densificación (B, C, D...) con normas más generosas. Las tablas de
   densificación SOLO aplican si el proyecto cumple las condiciones del
   Capítulo V de la Ordenanza (área libre, antejardines, cableado, etc).

   Campos: dens=densidad bruta máx, predio=subdivisión predial mín,
           cc=coef. constructibilidad, cos=coef. ocupación de suelo,
           al=coef. área libre, pisos/metros=altura máx.
   --------------------------------------------------------------------------- */
var PRC_NORMAS = {

  /* ---------- EDIFICACIÓN BAJA ---------- */
  'EAb1': {
    nombre:'Edificación Aislada Baja N°1', familia:'baja',
    tablas:[
      { t:'A', label:'Base', dens:'40 hab/ha', predio:'1.000 m²', cc:0.6, cos:0.4,
        rasante:'60°', pisos:3, metros:10.5, antejardin:'5 m', dist:'O.G.U.C.',
        ados:'O.G.U.C.', agrup:'Aislado' },
      { t:'B', label:'Densificación · viviendas colectivas', dens:'60 hab/ha', predio:'2.500 m²',
        cc:0.6, cos:0.2, rasante:'45°', pisos:3, metros:10.5, antejardin:'10 m',
        dist:'11 m', ados:'No se permite', agrup:'Aislado' }
    ],
    notas:['Subzona E-Ab1-A permite Tabla C): 150 hab/ha, predio 4.000 m², CC 1,6, COS 0,3, 5 pisos / 17,5 m.']
  },
  'EAb2': {
    nombre:'Edificación Aislada Baja N°2', familia:'baja',
    tablas:[
      { t:'A', label:'Base', dens:'130 hab/ha', predio:'500 m²', cc:0.6, cos:0.4,
        rasante:'60°', pisos:3, metros:10.5, antejardin:'5 m', dist:'O.G.U.C.',
        ados:'O.G.U.C.', agrup:'Aislado' },
      { t:'B', label:'Densificación · equip. salud o educación (subzona Ab2-A)', dens:'No aplica',
        predio:'500 m²', cc:0.8, cos:0.5, rasante:'60°', pisos:3, metros:10.5,
        antejardin:'5 m', dist:'O.G.U.C.', ados:'O.G.U.C.', agrup:'Aislado y Pareado' },
      { t:'C', label:'Densificación (subzona Ab2-B)', dens:'190 hab/ha', predio:'1.000 m²',
        cc:1.6, cos:0.35, rasante:'70°', pisos:5, metros:17.5, antejardin:'7 m',
        dist:'7 m', ados:'No se permite', agrup:'Aislado',
        nota:'En Conjunto Armónico la altura máx. baja a 4 pisos / 14 m.' },
      { t:'D', label:'Densificación · culto (subzona Ab2-C)', dens:'No aplica', predio:'2.500 m²',
        cc:0.6, cos:0.5, rasante:'70°', pisos:null, metros:20, antejardin:'10 m',
        dist:'7 m', ados:'No se permite', agrup:'Aislado' }
    ],
    notas:[
      'Ampliaciones de viviendas unifamiliares pueden aplicar CC 0,8.',
      'En deslindes con zonas de edificación media o alta se aplica rasante de 60° para ambas zonas.'
    ]
  },
  'EAb3': {
    nombre:'Edificación Aislada Baja N°3', familia:'baja',
    tablas:[
      { t:'A', label:'Base', dens:'120 hab/ha', predio:'300 m²', cc:0.8, cos:0.4,
        rasante:'60°', pisos:3, metros:10.5, antejardin:'5 m', dist:'O.G.U.C.',
        ados:'O.G.U.C.', agrup:'Aislado y Pareado' }
    ],
    notas:['En deslindes con zonas de edificación media o alta se aplica rasante de 60° para ambas zonas.']
  },
  'EAb4': {
    nombre:'Edificación Aislada Baja N°4', familia:'baja',
    tablas:[
      { t:'A', label:'Base', dens:'10 hab/ha', predio:'2.500 m²', cc:0.12, cos:0.12,
        rasante:'45°', pisos:3, metros:10.5, antejardin:'Colectivas 10 m · Individuales O.G.U.C.',
        dist:'Colectivas 10 m · Individuales O.G.U.C.', ados:'No se permite', agrup:'Aislado' },
      { t:'B', label:'Densificación', dens:'90 hab/ha', predio:'2.500 m²', cc:0.8, cos:0.3,
        al:0.5, rasante:'60°', pisos:4, metros:14, antejardin:'10 m', dist:'11 m',
        ados:'No se permite', agrup:'Aislado' }
    ],
    notas:[
      'La Tabla B) exige cumplir la Condición de Desarrollo de Obras en el Espacio Público (Art. 29).',
      'Sector Vital Apoquindo (S-VA): con equipamiento de al menos 1.000 m² edificados, la densidad sube a 90 hab/ha y el CC a 1,2 (el equipamiento debe cumplir COS 0,5).'
    ]
  },
  'EAb4p': {
    nombre:"Edificación Aislada Baja N°4 prima", familia:'baja',
    tablas:[
      { t:'A', label:'Base', dens:'10 hab/ha', predio:'2.500 m²', cc:0.12, cos:0.12,
        rasante:'45°', pisos:3, metros:10.5, antejardin:'10 m', dist:'11 m',
        ados:'No se permite', agrup:'Aislado' },
      { t:'B', label:'Densificación', dens:'60 hab/ha', predio:'600 m²', cc:0.6, cos:0.4,
        al:null, rasante:'70°', pisos:3, metros:10.5, antejardin:'5 m', dist:'O.G.U.C.',
        ados:'No se permite', agrup:'Aislado', nota:'Área libre: no se exige.' },
      { t:'C', label:'Densificación', dens:'100 hab/ha', predio:'2.500 m²', cc:0.8, cos:0.3,
        al:0.4, rasante:'60°', pisos:4, metros:14, antejardin:'7 m', dist:'11 m',
        ados:'No se permite', agrup:'Aislado' }
    ],
    notas:[
      'Las Tablas B) y C) exigen cumplir la Condición de Desarrollo de Obras en el Espacio Público (Art. 29).',
      'Loteos acogidos a Tabla B) pueden bajar hasta 25% la subdivisión predial mínima, si los predios bajo mínimo no superan el 20% del loteo.',
      'Art. 18: proyectos acogidos a la altura de Tabla C) destinados 100% a vivienda colectiva pueden concentrar densidad hasta 240 hab/ha en algún sector, manteniendo 120 hab/ha promedio en el predio.'
    ]
  },

  /* ---------- EDIFICACIÓN MEDIA ---------- */
  'EAm1': {
    nombre:'Edificación Aislada Media N°1', familia:'media',
    tablas:[
      { t:'A', label:'Base', dens:'40 hab/ha', predio:'1.000 m²', cc:0.6, cos:0.4,
        rasante:'60°', pisos:3, metros:10.5, antejardin:'5 m', dist:'O.G.U.C.',
        ados:'O.G.U.C.', agrup:'Aislado' },
      { t:'B', label:'Densificación · vivienda y equipamiento', dens:'320 hab/ha', predio:'800 m²',
        cc:1.0, cos:0.3, al:0.2, rasante:'60°', pisos:4, metros:14, antejardin:'7 m',
        dist:'6 m', ados:'No se permite', agrup:'Aislado',
        nota:'El área libre debe disponerse en el nivel natural del terreno.' },
      { t:'C', label:'Densificación · subzona Lo Fontecilla (Am1-A)', dens:'240 hab/ha',
        predio:'4.000 m²', cc:0.6, cos:0.35, al:0.4, rasante:'60°', pisos:4, metros:14,
        antejardin:'10 m', dist:'11 m', ados:'No se permite', agrup:'Aislado',
        nota:'Distanciamiento mínimo de 18 m con la zona E-e5 "Casa de Lo Fontecilla y su Parque".' }
    ],
    notas:['La Tabla B) excluye el subsector "Lo Fontecilla", que se rige por la Tabla C).']
  },
  'EAm1p': {
    nombre:"Edificación Aislada Media N°1 prima", familia:'media',
    tablas:[
      { t:'A', label:'Base', dens:'20 hab/ha', predio:'2.500 m²', cc:0.6, cos:0.4,
        rasante:'60°', pisos:3, metros:10.5, antejardin:'5 m', dist:'O.G.U.C.',
        ados:'No se permite', agrup:'Aislado' },
      { t:'B', label:'Densificación · equipamiento', dens:'No aplica', predio:'1.500 m²',
        cc:2.5, cos:0.7, al:0.2, rasante:'70°', pisos:4, metros:14, antejardin:'7 m',
        dist:'4 m', ados:'Pareado con permiso simultáneo', agrup:'Aislado y Pareado' },
      { t:'C', label:'Densificación · equipamiento', dens:'No aplica', predio:'1.500 m²',
        cc:2.5, cos:0.5, al:0.2, rasante:'70°', pisos:5, metros:17.5, antejardin:'7 m',
        dist:'5 m', ados:'No se permite', agrup:'Aislado' },
      { t:'D', label:'Densificación · vivienda', dens:'Libre', predio:'1.500 m²',
        cc:2.5, cos:0.3, al:0.2, rasante:'70°', pisos:7, metros:24.5, antejardin:'7 m',
        dist:'7 m', ados:'No se permite', agrup:'Aislado',
        nota:'Altura 24,5 m general; 21 m si el destino es vivienda.' }
    ],
    notas:['Sector Avda. Las Condes (S-LC): CC de 1,8 para proyectos de densificación de cualquier destino, manteniendo el resto de las tablas. Exige distanciamiento de 18 m con predios en E-Ab1 y 12 m con E-Ab2 / E-Ab3.']
  },
  'EAm2': {
    nombre:'Edificación Aislada Media N°2', familia:'media',
    tablas:[
      { t:'A', label:'Base', dens:'20 hab/ha', predio:'2.500 m²', cc:0.6, cos:0.4,
        rasante:'60°', pisos:3, metros:10.5, antejardin:'5 m', dist:'O.G.U.C.',
        ados:'No se permite', agrup:'Aislado' },
      { t:'B', label:'Densificación · vivienda y equipamiento', dens:'580 hab/ha', predio:'1.500 m²',
        cc:1.6, cos:0.3, al:0.4, rasante:'70°', pisos:7, metros:20, antejardin:'7 m',
        dist:'7 m', ados:'No se permite', agrup:'Aislado',
        nota:'Equipamiento clase Servicios en predio ≥ 2.000 m²: hasta 7 pisos / 25 m con antejardín 10 m.' },
      { t:'C', label:'Densificación · vivienda (subzona Am2-A)', dens:'1.170 hab/ha', predio:'2.500 m²',
        cc:1.6, cos:0.4, al:0.4, rasante:'70°', pisos:4, metros:14, antejardin:'7 m',
        dist:'O.G.U.C.', ados:'No se permite', agrup:'Aislado' }
    ],
    notas:[
      'Tabla B): distanciamiento mínimo de 12 m en el deslinde de contrafrente con predios de E-Ab2 o E-Ab3.',
      'Sector Cuarto Centenario (S-CC): predio mínimo 2.500 m², antejardín 15 m y acceso por al menos dos calles.'
    ]
  },
  'EAm4': {
    nombre:'Edificación Aislada Media N°4', familia:'media',
    tablas:[
      { t:'A', label:'Base', dens:'20 hab/ha', predio:'2.500 m²', cc:0.6, cos:0.4,
        rasante:'60°', pisos:3, metros:10.5, antejardin:'5 m', dist:'O.G.U.C.',
        ados:'No se permite', agrup:'Aislado' },
      { t:'B', label:'Densificación · vivienda y equipamiento', dens:'860 hab/ha', predio:'1.500 m²',
        cc:1.8, cos:0.4, al:0.4, rasante:'70°', pisos:9, metros:31.5, antejardin:'7 m',
        dist:'8 m', ados:'No se permite', agrup:'Aislado',
        nota:'No se permite uso de vivienda en el primer piso (Art. 36). Área libre en nivel natural del terreno.' },
      { t:'C', label:'Densificación · subzona Am4-A (Hermanos Cabot)', dens:'660 hab/ha',
        predio:'Manzana completa', cc:2.0, cos:0.25, al:0.5, rasante:'70°', pisos:13, metros:null,
        antejardin:'7 m · 10 m Hnos. Cabot · 25 m Pdte. Riesco', dist:'—', ados:'—', agrup:'Aislado',
        nota:'13 pisos con frente a Hermanos Cabot; 7 pisos con frente a Pdte. Riesco. Exige tomar todos los predios de la manzana.' }
    ],
    notas:[
      'Sector Cerro San Luis (S-CSL): COS 0,1 y altura máx. que no sobrepase los 690,50 m.s.n.m.',
      'Sector Visviri (S-V): hasta 12 pisos / 42 m con frente a Padre Hurtado; 7 pisos / 25 m con frente a Visviri; 7 pisos / 24,5 m con frente a Manuel Claro Vial.',
      'Sectores Los Militares (S-LM) y Cerro El Plomo (S-CEP): densificación hasta 12 pisos / 42 m.'
    ]
  },

  /* ---------- EDIFICACIÓN ALTA ---------- */
  'EAa1': {
    nombre:'Edificación Aislada Alta N°1', familia:'alta',
    tablas:[
      { t:'A', label:'Base', dens:'20 hab/ha', predio:'2.500 m²', cc:1.0, cos:0.4,
        rasante:'70°', pisos:3, metros:10.5, antejardin:'7 m', dist:'6 m',
        ados:'No se permite', agrup:'Aislado' },
      { t:'B', label:'Densificación · equipamiento', dens:'No aplica', predio:'1.500 m²',
        cc:1.8, cos:0.3, al:0.3, rasante:'70°', pisos:12, metros:42, antejardin:'7 m',
        dist:'8 m', ados:'No se permite', agrup:'Aislado' },
      { t:'C', label:'Densificación · vivienda', dens:'840 hab/ha', predio:'1.500 m²',
        cc:2.0, cos:0.3, al:0.3, rasante:'70°', pisos:15, metros:42, antejardin:'7 m',
        dist:'8 m', ados:'No se permite', agrup:'Aislado',
        nota:'No se permite uso de vivienda en el primer piso (Art. 36). Área libre en nivel natural del terreno.' }
    ],
    notas:['Si un proyecto en Tabla C) colinda con predio de edificación continua, puede continuar el agrupamiento y aumentar CC y COS en 10% (solo para la porción continua); en deslindes sin continuidad permitida, distanciamiento mínimo de 8 m.']
  },
  'EAa2': {
    nombre:'Edificación Aislada Alta N°2', familia:'alta',
    tablas:[
      { t:'A', label:'Base', dens:'20 hab/ha', predio:'2.500 m²', cc:1.0, cos:0.4,
        rasante:'70°', pisos:3, metros:10.5, antejardin:'7 m', dist:'6 m',
        ados:'No se permite', agrup:'Aislado' },
      { t:'B', label:'Densificación · vivienda y equipamiento', dens:'840 hab/ha', predio:'1.500 m²',
        cc:2.0, cos:0.3, al:0.5, rasante:'70°', pisos:15, metros:52.5, antejardin:'7 m',
        dist:'8 m', ados:'No se permite', agrup:'Aislado',
        nota:'El área libre debe disponerse en el nivel del primer piso.' }
    ],
    notas:['Colindando con edificación continua se puede continuar el agrupamiento con +10% de CC y COS para esa porción; distanciamiento mínimo de 8 m donde no se permite continuidad.']
  },
  'EAa3': {
    nombre:'Edificación Aislada Alta N°3', familia:'alta',
    tablas:[
      { t:'A', label:'Base', dens:'20 hab/ha', predio:'2.500 m²', cc:1.0, cos:0.4,
        rasante:'70°', pisos:3, metros:10.5, antejardin:'7 m', dist:'6 m',
        ados:'No se permite', agrup:'Aislado' },
      { t:'B', label:'Densificación · subzona Aa3-A', dens:'840 hab/ha', predio:'2.500 m²',
        cc:4.0, cos:0.4, al:0.6, rasante:'70°', pisos:15, metros:52.5, antejardin:'10 m',
        dist:'10 m', ados:'No se permite', agrup:'Aislado',
        nota:'Área delimitada por Pdte. Riesco, Estocolmo, Cerro El Plomo y Alonso de Córdova.' },
      { t:'C', label:'Densificación · subzona Aa3-B', dens:'840 hab/ha', predio:'2.500 m²',
        cc:2.0, cos:0.3, al:0.5, rasante:'70°', pisos:15, metros:52.5, antejardin:'7 m',
        dist:'8 m', ados:'No se permite', agrup:'Aislado',
        nota:'Área delimitada por Cerro El Plomo, Estocolmo, Los Militares y Alonso de Córdova.' }
    ],
    notas:[
      'El área libre de las Tablas B) y C) debe disponerse en el nivel de primer piso.',
      'Tablas B) y C): no se permite uso de vivienda en el primer piso (Art. 36).'
    ]
  },
  'EAa4': {
    nombre:'Edificación Aislada Alta N°4', familia:'alta',
    tablas:[
      { t:'A', label:'Base', dens:'20 hab/ha', predio:'2.500 m²', cc:1.0, cos:0.6,
        rasante:'70°', pisos:3, metros:10.5, antejardin:'7 m', dist:'6 m',
        ados:'No se permite', agrup:'Aislado' },
      { t:'B', label:'Densificación · equipamiento', dens:'No aplica', predio:'1.500 m²',
        cc:2.0, cos:0.4, al:0.3, rasante:'70°', pisos:12, metros:42, antejardin:'7 m',
        dist:'8 m', ados:'No se permite', agrup:'Aislado' },
      { t:'C', label:'Densificación · vivienda', dens:'1.200 hab/ha', predio:'1.500 m²',
        cc:2.5, cos:0.3, al:0.3, rasante:'70°', pisos:15, metros:42, antejardin:'7 m',
        dist:'8 m', ados:'No se permite', agrup:'Aislado' }
    ],
    notas:['Sector Isidora Goyenechea (S-IG): proyectos de restaurant/cafetería en Tabla A) pueden construir un piso continuo entre línea de edificación y línea oficial, sin aplicar antejardín.']
  },
  'EAa+cm': {
    nombre:'Edificación Aislada Alta con Continuidad Media', familia:'alta',
    tablas:[
      { t:'A', label:'Base', dens:'20 hab/ha', predio:'2.500 m²', cc:1.0, cos:0.6,
        rasante:'70°', pisos:3, metros:10.5, antejardin:'7 m', dist:'6 m',
        ados:'—', agrup:'Continuo y Aislado',
        nota:'No se permite uso de vivienda en el primer piso (Art. 36).' },
      { t:'B', label:'Densificación · vivienda o equipamiento aislado', dens:'Libre', predio:'1.500 m²',
        cc:3.0, cos:0.3, al:0.3, rasante:'70°', pisos:15, metros:52.5, antejardin:'7 m',
        dist:'8 m', ados:'No se permite', agrup:'Aislado',
        nota:'CC 3,0 y COS 0,3 aplican a la edificación aislada.' },
      { t:'C', label:'Densificación · equipamiento aislado', dens:'No aplica', predio:'2.500 m²',
        cc:3.0, cos:0.75, al:0.2, rasante:'70°', pisos:5, metros:17.5, antejardin:'7 m',
        dist:'4 m', ados:'No se permite', agrup:'Aislado',
        nota:'Con frente a Mar de los Sargazos o Rep. Árabe de Egipto se permite equipamiento continuo de máx. 2 pisos / 7 m.' },
      { t:'D', label:'Densificación · equipamiento en cuerpo continuo', dens:'Libre', predio:'1.500 m²',
        cc:3.0, cos:0.4, al:0.2, rasante:'70°', pisos:17, metros:59.5,
        antejardin:'Aislada 7 m · Continua 5 m', dist:'8 m', ados:'No se permite',
        agrup:'Continuo y Aislado',
        nota:'2 pisos / 7 m para la edificación continua y 17 pisos / 59,5 m para la aislada. CC y COS libres en la porción continua. Solo equipamiento en el nivel continuo.' }
    ],
    notas:[
      'Subzona Aa+cm-A (Pdte. Riesco / Isidora Goyenechea / Vitacura / Andrés Bello): Tabla E) con COS 0,6 hasta 40 m y 0,3 sobre 40 m, área libre 0,70 en N.N.T., altura libre, rasante 70° aplicada a 40 m.',
      'Subzona Aa+cm-B (Isidora Goyenechea / Augusto Leguía / Don Carlos): continuidad obligatoria, 8 pisos / 32 m.',
      'Antejardines por sector: Los Milagros 3 m · Apoquindo 4 m · El Bosque, Isidora Goyenechea, El Golf, Ntra. Sra. de los Ángeles, Alcántara, La Gloria y Noruega 6 m · Andrés Bello (Tajamar–Isidora) 12 m.',
      'Cuerpo continuo destinado a comercio en todo el frente: permite un piso adicional de hasta 4 m sobre la altura máxima.'
    ]
  },
  'EAa+ca': {
    nombre:'Edificación Aislada Alta con Continuidad Alta', familia:'alta',
    tablas:[
      { t:'A', label:'Base', dens:'20 hab/ha', predio:'2.500 m²', cc:1.0, cos:0.6,
        rasante:'70°', pisos:3, metros:10.5, antejardin:'7 m', dist:'6 m',
        ados:'No se permite', agrup:'Continuo y Aislado' },
      { t:'B', label:'Densificación · vivienda y equipamiento', dens:'Libre', predio:'1.500 m²',
        cc:2.5, cos:0.4, al:0.2, rasante:'70°', pisos:15, metros:52.5, antejardin:'7 m',
        dist:'8 m', ados:'No se permite', agrup:'Aislado',
        nota:'No se permite uso de vivienda en el primer piso (Art. 36).' },
      { t:'C', label:'Densificación · solo equipamiento (subzona Aa+ca-A)', dens:'No aplica',
        predio:'Libre', cc:2.0, cos:0.7, al:0.3, rasante:'70°', pisos:4, metros:14,
        antejardin:'7 m', dist:'6 m', ados:'Según O.G.U.C.', agrup:'Continuo o Aislado' }
    ],
    notas:['Densificación exige distanciamiento mínimo de 12 m con predios de las zonas E-Ab2 o E-Ab3.']
  },

  /* ---------- ZONAS ESPECIALES ---------- */
  'Ee1': {
    nombre:'Edificación Especial N°1 · Equipamientos', familia:'equipamiento',
    tablas:[
      { t:'A', label:'Base', dens:'No aplica',
        predio:'2.500 m² equip. comercial · 10.000 m² equip. cultural', cc:1.4, cos:0.6,
        al:0.3, rasante:'60°', pisos:5, metros:17.5, antejardin:'10 m · 5 m',
        dist:'11 m · O.G.U.C.', ados:'No se permite', agrup:'Aislado',
        nota:'La tabla original distingue dos casos de altura (5 pisos / 17,5 m y 2 pisos / 7 m) según el equipamiento.' },
      { t:'B', label:'Densificación · subzona SE-M', dens:'1.170 hab/ha',
        predio:'Existente o nuevos de 2.500 m² con frente ≥ 70 m entre líneas oficiales',
        cc:2.0, cos:0.6, al:0.4, rasante:'70°', pisos:15, metros:52.5,
        antejardin:'Continua 10 m · Aislada 15 m', dist:'10 m', ados:'No se permite',
        agrup:'Continuo y Aislado',
        nota:'4 pisos / 14 m para edificación continua y 15 pisos / 52,5 m para la aislada. COS 0,6 continua hasta 14 m y 0,4 aislada sobre 14 m. Exige sin estacionamientos en superficie, carga/descarga en subterráneo y cuerpo continuo no destinado a vivienda.' },
      { t:'C', label:'Subzonas SE-CC\' y SE-CE\'', dens:'No aplica', predio:'2.500 m²',
        cc:0.8, cos:0.5, rasante:'60°', pisos:3, metros:10.5, antejardin:'5 m',
        dist:'O.G.U.C.', ados:'No se permite', agrup:'Aislado' }
    ],
    notas:[
      'Zona de equipamientos ya construidos y singularizados en la Ordenanza (malls, clínicas, colegios, comisarías, etc.).',
      'Las edificaciones existentes se eximen del antejardín mínimo; toda nueva edificación sí debe respetarlo.'
    ]
  },
  'Ee2': {
    nombre:'Edificación Especial N°2 · Equipamiento Recreacional Deportivo', familia:'equipamiento',
    tablas:[
      { t:'A', label:'Base', dens:'—', predio:'—', cc:0.3, cos:0.2, al:0.7,
        rasante:'60°', pisos:5, metros:17.5, antejardin:'7 m', dist:'11 m',
        ados:'No se permite', agrup:'Aislado' }
    ],
    notas:['Estadios y clubes deportivos singularizados en la Ordenanza (Estadio Español, Stade Français, Club de Golf Los Leones, San Carlos de Apoquindo, etc.).']
  },
  'Ee3': {
    nombre:'Edificación Especial N°3 · Áreas Verdes Intercomunales y Comunales', familia:'verde',
    tablas:[
      { t:'A', label:'Normas complementarias', dens:'—', predio:'—', cc:null, cos:null,
        rasante:'60°', pisos:3, metros:10.5, antejardin:'7 m', dist:'11 m',
        ados:'No se permite', agrup:'—' }
    ],
    notas:['Parques, cerros isla, parques quebrada y avenidas parque. Las condiciones de edificación se rigen principalmente por la Ordenanza del PRMS; lo indicado son normas complementarias del PRC.']
  },
  'Ee4': {
    nombre:'Edificación Especial N°4 · Parques Metropolitanos', familia:'verde',
    tablas:[],
    notas:['Parque del Río Mapocho. Las condiciones de edificación se rigen por la Ordenanza del Plan Regulador Metropolitano de Santiago.']
  },
  'Ee5': {
    nombre:'Edificación Especial N°5 · Protección de Valor Patrimonial Cultural', familia:'patrimonial',
    tablas:[
      { t:'A', label:'Base', dens:'8 hab/ha', predio:'2.500 m²', cc:0.6, cos:0.4,
        rasante:'60°', pisos:2, metros:10.5, antejardin:'Existente', dist:'O.G.U.C.',
        ados:'O.G.U.C.', agrup:'Aislado y Pareado',
        nota:'2 pisos y mansarda, con altura máxima de 10,5 m.' }
    ],
    notas:[
      'Monumentos Históricos y Zonas Típicas requieren autorización previa del Consejo de Monumentos Nacionales.',
      'Inmuebles y Zonas de Conservación Histórica requieren autorización previa de la SEREMI Metropolitana de Vivienda y Urbanismo.',
      'Los predios colindantes por el oriente con la ZCH Pdte. Errázuriz se rigen por E-Am1 con CC y COS incrementados en 30% (CC 1,3 · COS 0,4 · 320 hab/ha · 4 pisos / 14 m).'
    ]
  },
  'AV': {
    nombre:'Área Verde', familia:'verde',
    tablas:[],
    notas:['Áreas verdes del Plan. Sin normas de edificación propias en el Art. 38; se rigen por el destino de área verde y, cuando corresponde, por el PRMS.']
  }
};

/* Etiquetas de las zonas de uso de suelo (parte antes del "/") — Art. 3.2 */
var PRC_USOS = {
  'UV':   'Uso de suelo Vivienda',
  'UV1':  'Vivienda N°1 · equipamiento en baja intensidad',
  'UV2':  'Vivienda N°2 · equipamiento en menor intensidad',
  'UV3':  'Vivienda N°3 · equip., instalaciones y oficinas en media intensidad',
  'UVO':  'Vivienda y Oficina · equip., instalaciones y oficinas en media intensidad',
  'UC1':  'Comercial N°1 · comercio e instituciones comunales',
  'UC2':  'Comercial N°2 · comercio e instituciones metropolitanas',
  'UC3':  'Comercial N°3 · taller y comercio menor',
  'UM':   'Metropolitano · comercio y equipamiento de escala metropolitana',
  'UEe1': 'Especial N°1 · equipamientos',
  'UEe2': 'Especial N°2 · equipamiento recreacional deportivo',
  'UEe3': 'Especial N°3 · áreas verdes',
  'UEe4': 'Especial N°4 · parques metropolitanos',
  'UEe5': 'Especial N°5 · protección de valor patrimonial',
  'AV':   'Área Verde'
};

/* Incentivos generales (Cap. IV) — aplican transversalmente */
var PRC_INCENTIVOS = [
  ['Art. 17 · Superficie predial', 'Predios de 2 o más veces la subdivisión predial mínima pueden aumentar el CC hasta 30% (no acumulable con Conjunto Armónico).'],
  ['Art. 18 · Vivienda en altura', 'En zonas de edificación alta con densidad máxima, proyectos de más de 3 pisos pueden superar la densidad hasta 30% si dan 1 estacionamiento cada 30 m² útiles de vivienda.'],
  ['Art. 19 · Cableado subterráneo', 'En zonas altas, medias, E-Ab4 y E-Ab4\', soterrar todo el cableado de los frentes permite aumentar el CC hasta 10%.'],
  ['Art. 20 · Proyectos comunitarios', 'Equipamiento municipal de salud, social, educación o deportivo y vivienda social pueden adicionar hasta 0,3 al CC de las tablas de densificación.'],
  ['Art. 21 · Predio entre edificios mayores', 'Predios anteriores a 13-jun-1995 entre dos predios con edificaciones de mayor altura y densidad pueden optar a las mismas condiciones de los adyacentes.'],
  ['Art. 22 · Piso retirado', 'Sobre la altura máxima se permite un piso retirado habitable de hasta 4 m, de máx. 65% de la planta inferior, inscrito en la rasante. No cuenta en la altura total.'],
  ['Art. 23 · Agrupamiento continuo', 'En E-Aa+cm, E-Aa+ca y E-e1, el CC y COS se incrementan lo suficiente para construir el cuerpo continuo, sin aumentar la altura máxima.']
];

/* Estacionamientos mínimos de vivienda (Art. 15) — útil para cabidas */
var PRC_ESTACIONAMIENTOS = [
  ['< 70 m² útiles', '1 por vivienda'],
  ['70 a < 110 m²', '1,5 por vivienda'],
  ['110 a < 140 m²', '2 por vivienda'],
  ['140 a < 180 m²', '2,5 por vivienda'],
  ['≥ 180 m²', '3 por vivienda']
];


/* ===========================================================================
   2. ESTADO
   =========================================================================== */

var prcData = null;          // GeoJSON crudo
var prcLayer = null;         // capa Leaflet
var prcVisible = false;      // capa prendida/apagada
var prcLoading = false;
var prcSelectedFeature = null;
var prcFamiliaFiltro = null; // si está seteado, solo se ven zonas de esa familia
var prcView = 'zona';        // 'zona' | 'legend' | 'ranking'
var prcHighlight = null;     // capa de resalte del polígono clickeado


/* ===========================================================================
   3. UTILIDADES
   =========================================================================== */

// Separa "UV1/EAm4" → {uso:'UV1', edif:'EAm4'}. "AV" → ambos 'AV'.
function splitZona(z){
  if(!z) return {uso:'', edif:''};
  var p = z.split('/');
  if(p.length === 1) return {uso:p[0], edif:p[0]};
  return {uso:p[0], edif:p[1]};
}

function normasDe(zona){
  return PRC_NORMAS[splitZona(zona).edif] || null;
}

function familiaDe(zona){
  var n = normasDe(zona);
  return (n && n.familia) ? n.familia : 'otro';
}

function colorDe(zona){
  var f = PRC_FAMILIAS[familiaDe(zona)];
  return f ? f.color : PRC_FAMILIAS.otro.color;
}

function fmtCoef(v){
  if(v === null || v === undefined) return '—';
  return v.toString().replace('.', ',');
}

function fmtAltura(tb){
  if(tb.pisos && tb.metros) return tb.pisos + ' pisos · ' + fmtCoef(tb.metros) + ' m';
  if(tb.pisos) return tb.pisos + ' pisos';
  if(tb.metros) return fmtCoef(tb.metros) + ' m';
  return '—';
}

// Máximos alcanzables de una zona, considerando TODAS sus tablas.
// Es lo que sirve para comparar potencial entre zonas.
function maximosDe(zona){
  var n = normasDe(zona);
  if(!n || !n.tablas.length) return null;
  var maxCC = 0, maxPisos = 0, maxMetros = 0, maxDens = 0;
  n.tablas.forEach(function(tb){
    if(tb.cc && tb.cc > maxCC) maxCC = tb.cc;
    if(tb.pisos && tb.pisos > maxPisos) maxPisos = tb.pisos;
    if(tb.metros && tb.metros > maxMetros) maxMetros = tb.metros;
    var d = parseInt((tb.dens || '').toString().replace(/\./g, ''), 10);
    if(!isNaN(d) && d > maxDens) maxDens = d;
  });
  return { cc:maxCC, pisos:maxPisos, metros:maxMetros, dens:maxDens };
}

// Punto dentro de polígono (ray casting). ring = [[lng,lat], ...]
function pointInRing(lng, lat, ring){
  var inside = false;
  for(var i = 0, j = ring.length - 1; i < ring.length; j = i++){
    var xi = ring[i][0], yi = ring[i][1];
    var xj = ring[j][0], yj = ring[j][1];
    var intersect = ((yi > lat) !== (yj > lat)) &&
                    (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if(intersect) inside = !inside;
  }
  return inside;
}

// Considera anillos interiores (hoyos) del polígono
function pointInPolygon(lng, lat, coords){
  if(!pointInRing(lng, lat, coords[0])) return false;
  for(var i = 1; i < coords.length; i++){
    if(pointInRing(lng, lat, coords[i])) return false; // cae en un hoyo
  }
  return true;
}

// Busca la feature del PRC que contiene el punto
function findZonaAt(lat, lng){
  if(!prcData) return null;
  for(var i = 0; i < prcData.features.length; i++){
    var f = prcData.features[i];
    var g = f.geometry;
    if(g.type === 'Polygon'){
      if(pointInPolygon(lng, lat, g.coordinates)) return f;
    } else if(g.type === 'MultiPolygon'){
      for(var k = 0; k < g.coordinates.length; k++){
        if(pointInPolygon(lng, lat, g.coordinates[k])) return f;
      }
    }
  }
  return null;
}

function esc(s){
  return (s === null || s === undefined) ? '' :
    s.toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}


/* ===========================================================================
   4. CSS
   =========================================================================== */

function injectCSS(){
  var css = `
  /* Botón PRC en los controles del mapa */
  #prc-btn {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 8px 12px; font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);
    cursor: pointer; display: flex; align-items: center; gap: 6px;
    transition: all 0.25s cubic-bezier(0.4,0,0.2,1); box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }
  #prc-btn:hover { border-color: var(--accent); color: var(--accent); }
  #prc-btn.active { background: var(--pl-deep); border-color: var(--pl-deep); color: #fff; }
  #prc-btn svg { width: 12px; height: 12px; }
  #prc-btn .prc-spin {
    width: 10px; height: 10px; border: 1.5px solid rgba(255,255,255,0.35);
    border-top-color: #fff; border-radius: 50%; animation: spin 0.8s linear infinite;
  }

  /* Panel flotante del PRC */
  #prc-panel {
    position: absolute; top: 102px; right: 14px; z-index: 505;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
    box-shadow: 0 6px 24px rgba(0,0,0,0.14);
    display: none; flex-direction: column;
    width: 390px; max-width: calc(100vw - 28px);
    max-height: calc(100vh - 130px); overflow: hidden;
  }
  #prc-panel.open { display: flex; animation: prcIn 0.3s cubic-bezier(0.4,0,0.2,1); }
  @keyframes prcIn {
    from { opacity: 0; transform: translateY(-10px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  body.dashboard-open #prc-panel { display: none !important; }

  #prc-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 11px 14px; border-bottom: 1px solid var(--border); background: var(--bg);
    flex-shrink: 0;
  }
  .prc-head-title {
    display: flex; align-items: center; gap: 8px;
    font-family: var(--font-serif); font-size: 14px; font-weight: 500; color: var(--text);
  }
  .prc-head-actions { display: flex; gap: 4px; align-items: center; }
  .prc-icon-btn {
    background: transparent; border: none; color: var(--text-faint); cursor: pointer;
    font-size: 11px; font-family: var(--font-mono); padding: 4px 8px; border-radius: var(--radius);
    transition: all 0.22s cubic-bezier(0.4,0,0.2,1);
  }
  .prc-icon-btn:hover { background: var(--surface); color: var(--text); }
  .prc-icon-btn.on { background: var(--pl-deep); color: #fff; }

  #prc-body { overflow-y: auto; padding: 12px 14px; }
  #prc-body::-webkit-scrollbar { width: 6px; }
  #prc-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

  .prc-zona-code {
    font-family: var(--font-mono); font-size: 15px; font-weight: 500; color: var(--text);
    letter-spacing: 0.02em; margin-bottom: 3px; word-break: break-word;
  }
  .prc-zona-name { font-size: 12px; color: var(--text-muted); line-height: 1.45; margin-bottom: 10px; }
  .prc-fam-badge {
    display: inline-flex; align-items: center; gap: 6px;
    font-family: var(--font-mono); font-size: 10px; padding: 3px 9px; border-radius: 12px;
    color: #fff; letter-spacing: 0.04em; margin-bottom: 12px;
  }

  /* Resumen de máximos */
  .prc-max-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 14px; }
  .prc-max { background: var(--pl-mint-bg); border-radius: var(--radius); padding: 9px 10px; }
  .prc-max-label {
    font-family: var(--font-mono); font-size: 9px; color: var(--pl-deep); opacity: 0.75;
    letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 3px;
  }
  .prc-max-val {
    font-family: var(--font-serif); font-size: 17px; font-weight: 500; color: var(--pl-deep);
    line-height: 1.1;
  }
  .prc-max-val span { font-family: var(--font-mono); font-size: 10px; font-weight: 400; opacity: 0.7; }

  /* Tablas de normas */
  .prc-tabla {
    border: 1px solid var(--border); border-radius: var(--radius);
    margin-bottom: 8px; overflow: hidden;
  }
  .prc-tabla-head {
    padding: 9px 11px; background: var(--bg); cursor: pointer;
    display: flex; align-items: center; gap: 8px;
    transition: background 0.15s;
  }
  .prc-tabla-head:hover { background: var(--pl-mint-bg); }
  .prc-tabla-tag {
    font-family: var(--font-mono); font-size: 10px; font-weight: 600;
    background: var(--pl-deep); color: #fff; width: 18px; height: 18px;
    border-radius: 4px; display: inline-flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .prc-tabla-tag.base { background: var(--text-muted); }
  .prc-tabla-label { font-size: 11.5px; color: var(--text); font-weight: 500; flex: 1; line-height: 1.35; }
  .prc-tabla-arrow { color: var(--text-faint); font-size: 9px; transition: transform 0.2s; flex-shrink: 0; }
  .prc-tabla.open .prc-tabla-arrow { transform: rotate(90deg); }
  .prc-tabla-body { display: none; padding: 4px 11px 10px; }
  .prc-tabla.open .prc-tabla-body { display: block; }

  .prc-row {
    display: flex; justify-content: space-between; gap: 12px;
    padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 11.5px;
  }
  .prc-row:last-of-type { border-bottom: none; }
  .prc-row-k { color: var(--text-muted); flex-shrink: 0; }
  .prc-row-v { font-family: var(--font-mono); font-weight: 500; text-align: right; word-break: break-word; }
  .prc-row-v.hi { color: var(--pl-deep); font-size: 12.5px; }
  .prc-nota {
    font-size: 10.5px; color: var(--text-muted); line-height: 1.5;
    background: var(--bg); border-left: 2px solid var(--border-strong);
    padding: 7px 9px; border-radius: 0 4px 4px 0; margin-top: 8px;
  }

  .prc-section-lbl {
    font-family: var(--font-mono); font-size: 9.5px; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--accent); margin: 16px 0 8px; font-weight: 500;
  }
  .prc-uso-box {
    font-size: 11.5px; line-height: 1.55; padding: 9px 11px; border-radius: var(--radius);
    margin-bottom: 6px;
  }
  .prc-uso-box b {
    display: block; font-family: var(--font-mono); font-size: 9.5px; letter-spacing: 0.06em;
    text-transform: uppercase; margin-bottom: 4px; font-weight: 500;
  }
  .prc-uso-perm { background: var(--green-bg); color: var(--text); }
  .prc-uso-perm b { color: var(--green); }
  .prc-uso-proh { background: var(--red-bg); color: var(--text); }
  .prc-uso-proh b { color: var(--red); }
  .prc-uso-pref { background: var(--accent-bg); color: var(--text); }
  .prc-uso-pref b { color: var(--accent); }

  .prc-foot {
    font-family: var(--font-mono); font-size: 9.5px; color: var(--text-faint);
    line-height: 1.6; margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--border);
  }
  .prc-foot a { color: var(--accent); }

  /* Leyenda */
  .prc-leg-item {
    display: flex; align-items: center; gap: 9px; padding: 8px 10px;
    border-radius: var(--radius); cursor: pointer; font-size: 12px;
    transition: background 0.15s; margin-bottom: 2px;
  }
  .prc-leg-item:hover { background: var(--bg); }
  .prc-leg-item.dim { opacity: 0.35; }
  .prc-leg-swatch { width: 14px; height: 14px; border-radius: 3px; flex-shrink: 0; }
  .prc-leg-name { flex: 1; color: var(--text); }
  .prc-leg-count { font-family: var(--font-mono); font-size: 10px; color: var(--text-faint); }

  /* Ranking */
  .prc-rank-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  .prc-rank-table th {
    font-family: var(--font-mono); font-size: 9px; text-transform: uppercase;
    letter-spacing: 0.06em; color: var(--text-faint); text-align: right;
    padding: 6px 5px; border-bottom: 1px solid var(--border); font-weight: 500;
  }
  .prc-rank-table th:first-child { text-align: left; }
  .prc-rank-table td { padding: 8px 5px; border-bottom: 1px solid var(--border); }
  .prc-rank-table td.num { text-align: right; font-family: var(--font-mono); }
  .prc-rank-table tr { cursor: pointer; }
  .prc-rank-table tbody tr:hover { background: var(--pl-mint-bg); }
  .prc-rank-dot { width: 8px; height: 8px; border-radius: 2px; display: inline-block; margin-right: 6px; }
  .prc-rank-code { font-family: var(--font-mono); font-size: 11px; font-weight: 500; }

  /* Sección dentro del detalle del terreno */
  .prc-terr-card {
    border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 13px;
    background: var(--bg);
  }
  .prc-terr-zona {
    font-family: var(--font-mono); font-size: 13px; font-weight: 500;
    color: var(--text); margin-bottom: 2px;
  }
  .prc-terr-name { font-size: 11px; color: var(--text-muted); line-height: 1.4; margin-bottom: 10px; }
  .prc-terr-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 10px; }
  .prc-terr-cell { background: var(--surface); border-radius: 6px; padding: 8px 9px; text-align: left; }
  .prc-terr-cell-lbl {
    font-family: var(--font-mono); font-size: 8.5px; color: var(--text-faint);
    text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;
  }
  .prc-terr-cell-val {
    font-family: var(--font-serif); font-size: 15px; font-weight: 500; color: var(--pl-deep); line-height: 1.1;
  }
  .prc-terr-btn {
    width: 100%; padding: 8px 10px; background: var(--surface);
    border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer;
    display: flex; align-items: center; justify-content: space-between;
    font-family: var(--font-sans); font-size: 11.5px; color: var(--text);
    transition: all 0.22s cubic-bezier(0.4,0,0.2,1);
  }
  .prc-terr-btn:hover { border-color: var(--pl-deep); color: var(--pl-deep); }

  @media (max-width: 900px){
    #prc-panel { top: auto; bottom: 90px; right: 14px; max-height: 55vh; width: calc(100vw - 28px); }
  }
  `;
  var el = document.createElement('style');
  el.id = 'prc-styles';
  el.textContent = css;
  document.head.appendChild(el);
}


/* ===========================================================================
   5. UI: BOTÓN Y PANEL
   =========================================================================== */

function buildUI(){
  // --- Botón en los controles del mapa ---
  var mc = document.getElementById('map-controls');
  if(mc){
    var wrap = document.createElement('div');
    wrap.style.position = 'relative';
    wrap.innerHTML =
      '<button id="prc-btn" title="Mostrar zonas del Plan Regulador Comunal">' +
        '<span id="prc-btn-icon">' +
          '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">' +
            '<path d="M1.5 4.5L5.5 2.5L10.5 4.5L14.5 2.5V11.5L10.5 13.5L5.5 11.5L1.5 13.5V4.5Z"/>' +
            '<path d="M5.5 2.5V11.5M10.5 4.5V13.5"/>' +
          '</svg>' +
        '</span>' +
        '<span id="prc-btn-label">PRC</span>' +
      '</button>';
    mc.appendChild(wrap);
    document.getElementById('prc-btn').addEventListener('click', togglePRC);
  }

  // --- Panel ---
  var panel = document.createElement('div');
  panel.id = 'prc-panel';
  panel.innerHTML =
    '<div id="prc-head">' +
      '<div class="prc-head-title">' +
        '<span id="prc-head-dot" style="width:9px;height:9px;border-radius:2px;background:var(--pl-deep)"></span>' +
        '<span id="prc-head-text">Plan Regulador</span>' +
      '</div>' +
      '<div class="prc-head-actions">' +
        '<button class="prc-icon-btn" id="prc-tab-legend" title="Leyenda y filtros">Capas</button>' +
        '<button class="prc-icon-btn" id="prc-tab-rank" title="Ranking de zonas por potencial">Ranking</button>' +
        '<button class="prc-icon-btn" id="prc-close" title="Cerrar">✕</button>' +
      '</div>' +
    '</div>' +
    '<div id="prc-body"></div>';
  var area = document.getElementById('map-area') || document.body;
  area.appendChild(panel);

  document.getElementById('prc-close').addEventListener('click', function(){
    document.getElementById('prc-panel').classList.remove('open');
  });
  document.getElementById('prc-tab-legend').addEventListener('click', function(){
    prcView = 'legend'; renderPanel();
  });
  document.getElementById('prc-tab-rank').addEventListener('click', function(){
    prcView = 'ranking'; renderPanel();
  });
}

function openPanel(){
  document.getElementById('prc-panel').classList.add('open');
}

function setBtnState(){
  var btn = document.getElementById('prc-btn');
  var lbl = document.getElementById('prc-btn-label');
  var ico = document.getElementById('prc-btn-icon');
  if(!btn) return;
  btn.classList.toggle('active', prcVisible);
  if(prcLoading){
    ico.innerHTML = '<span class="prc-spin"></span>';
    lbl.textContent = 'Cargando…';
  } else {
    ico.innerHTML =
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">' +
        '<path d="M1.5 4.5L5.5 2.5L10.5 4.5L14.5 2.5V11.5L10.5 13.5L5.5 11.5L1.5 13.5V4.5Z"/>' +
        '<path d="M5.5 2.5V11.5M10.5 4.5V13.5"/>' +
      '</svg>';
    lbl.textContent = 'PRC';
  }
}


/* ===========================================================================
   6. CARGA DE DATOS
   =========================================================================== */

function loadPRC(callback){
  if(prcData){ callback(null, prcData); return; }
  if(prcLoading){ return; }
  prcLoading = true;
  setBtnState();

  fetch(PRC_FUENTES['Las Condes'])
    .then(function(r){
      if(!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function(json){
      prcData = json;
      prcLoading = false;
      setBtnState();
      callback(null, json);
    })
    .catch(function(err){
      console.error('PRC: error al cargar el GeoJSON', err);
      prcLoading = false;
      setBtnState();
      callback(err, null);
    });
}


/* ===========================================================================
   7. CAPA EN EL MAPA
   =========================================================================== */

function styleFor(feature){
  var z = feature.properties.zona;
  var fam = familiaDe(z);
  var visible = !prcFamiliaFiltro || prcFamiliaFiltro === fam;
  return {
    color: colorDe(z),
    weight: visible ? 1 : 0,
    opacity: visible ? 0.85 : 0,
    fillColor: colorDe(z),
    fillOpacity: visible ? 0.32 : 0
  };
}

function buildLayer(){
  if(prcLayer) return;
  prcLayer = L.geoJSON(prcData, {
    renderer: L.canvas({ padding: 0.5 }),
    style: styleFor,
    onEachFeature: function(feature, layer){
      layer.on('click', function(e){
        L.DomEvent.stopPropagation(e);
        selectZona(feature, layer);
      });
      var sp = splitZona(feature.properties.zona);
      var n = normasDe(feature.properties.zona);
      layer.bindTooltip(
        feature.properties.zona + (n ? ' · ' + n.nombre : ''),
        { sticky:true, direction:'top', className:'prc-tip' }
      );
    }
  });
}

function togglePRC(){
  if(prcVisible){
    // Apagar
    prcVisible = false;
    if(prcLayer) map.removeLayer(prcLayer);
    clearHighlight();
    document.getElementById('prc-panel').classList.remove('open');
    setBtnState();
    return;
  }
  // Prender
  loadPRC(function(err){
    if(err){
      alert('No se pudo cargar el PRC. Revisa que prc-lascondes.geojson esté en la raíz del repo.');
      return;
    }
    buildLayer();
    prcLayer.addTo(map);
    // Los terrenos deben quedar por sobre los polígonos
    if(prcLayer.bringToBack) prcLayer.bringToBack();
    prcVisible = true;
    setBtnState();
    prcView = 'legend';
    renderPanel();
    openPanel();
  });
}

function clearHighlight(){
  if(prcHighlight){ map.removeLayer(prcHighlight); prcHighlight = null; }
}

function highlightFeature(feature){
  clearHighlight();
  prcHighlight = L.geoJSON(feature, {
    style: {
      color: '#1A1814', weight: 2.5, opacity: 1,
      fillColor: colorDe(feature.properties.zona), fillOpacity: 0.5
    }
  }).addTo(map);
}

function selectZona(feature, layer){
  prcSelectedFeature = feature;
  prcView = 'zona';
  highlightFeature(feature);
  renderPanel();
  openPanel();
}


/* ===========================================================================
   8. RENDER DEL PANEL
   =========================================================================== */

function renderPanel(){
  var body = document.getElementById('prc-body');
  var headText = document.getElementById('prc-head-text');
  var headDot = document.getElementById('prc-head-dot');
  if(!body) return;

  document.getElementById('prc-tab-legend').classList.toggle('on', prcView === 'legend');
  document.getElementById('prc-tab-rank').classList.toggle('on', prcView === 'ranking');

  if(prcView === 'legend'){
    headText.textContent = 'Plan Regulador · Las Condes';
    headDot.style.background = 'var(--pl-deep)';
    body.innerHTML = renderLegend();
    wireLegend();
  } else if(prcView === 'ranking'){
    headText.textContent = 'Potencial por zona';
    headDot.style.background = 'var(--pl-deep)';
    body.innerHTML = renderRanking();
    wireRanking();
  } else {
    if(!prcSelectedFeature){
      prcView = 'legend';
      return renderPanel();
    }
    headText.textContent = 'Zona seleccionada';
    headDot.style.background = colorDe(prcSelectedFeature.properties.zona);
    body.innerHTML = renderZona(prcSelectedFeature);
    wireZona();
  }
  body.scrollTop = 0;
}

/* --- Vista: leyenda + filtros --- */
function renderLegend(){
  var counts = {};
  prcData.features.forEach(function(f){
    var fam = familiaDe(f.properties.zona);
    counts[fam] = (counts[fam] || 0) + 1;
  });

  var keys = Object.keys(PRC_FAMILIAS).sort(function(a,b){
    return PRC_FAMILIAS[a].orden - PRC_FAMILIAS[b].orden;
  }).filter(function(k){ return counts[k]; });

  var items = keys.map(function(k){
    var f = PRC_FAMILIAS[k];
    var dim = prcFamiliaFiltro && prcFamiliaFiltro !== k;
    return '<div class="prc-leg-item' + (dim ? ' dim' : '') + '" data-fam="' + k + '">' +
      '<span class="prc-leg-swatch" style="background:' + f.color + '"></span>' +
      '<span class="prc-leg-name">' + f.label + '</span>' +
      '<span class="prc-leg-count">' + counts[k] + '</span>' +
    '</div>';
  }).join('');

  return '<div style="font-size:12px;color:var(--text-muted);line-height:1.55;margin-bottom:12px">' +
      'Click en cualquier zona del mapa para ver sus normas urbanísticas. ' +
      'Click en una familia para aislarla.' +
    '</div>' +
    items +
    (prcFamiliaFiltro
      ? '<button class="prc-icon-btn" id="prc-clear-filtro" style="margin-top:8px;border:1px solid var(--border)">Ver todas ✕</button>'
      : '') +
    '<div class="prc-foot">' +
      prcData.features.length + ' polígonos · ' +
      Object.keys(PRC_NORMAS).length + ' zonas de edificación normadas<br>' +
      'Geometría: Geoportal MINVU / IDE Chile<br>' +
      'Normas: Ordenanza PRC Las Condes, Texto Refundido incl. Modificación N°11 (oct. 2021)' +
    '</div>';
}

function wireLegend(){
  document.querySelectorAll('.prc-leg-item').forEach(function(el){
    el.addEventListener('click', function(){
      var fam = el.getAttribute('data-fam');
      prcFamiliaFiltro = (prcFamiliaFiltro === fam) ? null : fam;
      if(prcLayer) prcLayer.setStyle(styleFor);
      renderPanel();
    });
  });
  var cb = document.getElementById('prc-clear-filtro');
  if(cb) cb.addEventListener('click', function(){
    prcFamiliaFiltro = null;
    if(prcLayer) prcLayer.setStyle(styleFor);
    renderPanel();
  });
}

/* --- Vista: ranking de zonas por potencial --- */
function renderRanking(){
  // Zonas de edificación presentes en la data, con su superficie total
  var presentes = {};
  prcData.features.forEach(function(f){
    var edif = splitZona(f.properties.zona).edif;
    if(!presentes[edif]) presentes[edif] = { edif:edif, n:0 };
    presentes[edif].n++;
  });

  var filas = Object.keys(presentes).map(function(edif){
    var n = PRC_NORMAS[edif];
    var m = n && n.tablas.length ? maximosDe(edif) : null;
    return {
      edif: edif,
      nombre: n ? n.nombre : 'Sin normas cargadas',
      familia: n ? n.familia : 'otro',
      n: presentes[edif].n,
      cc: m ? m.cc : 0,
      pisos: m ? m.pisos : 0,
      dens: m ? m.dens : 0
    };
  }).filter(function(r){ return r.cc > 0 || r.pisos > 0; });

  filas.sort(function(a, b){
    if(b.cc !== a.cc) return b.cc - a.cc;
    return b.pisos - a.pisos;
  });

  var rows = filas.map(function(r){
    return '<tr data-edif="' + r.edif + '">' +
      '<td>' +
        '<span class="prc-rank-dot" style="background:' + PRC_FAMILIAS[r.familia].color + '"></span>' +
        '<span class="prc-rank-code">' + r.edif + '</span>' +
        '<div style="font-size:9.5px;color:var(--text-faint);margin-top:2px;padding-left:14px">' + r.n + ' polígono' + (r.n !== 1 ? 's' : '') + '</div>' +
      '</td>' +
      '<td class="num"><strong style="font-family:var(--font-serif);font-size:14px;color:var(--pl-deep)">' + fmtCoef(r.cc) + '</strong></td>' +
      '<td class="num">' + (r.pisos || '—') + '</td>' +
      '<td class="num">' + (r.dens ? r.dens.toLocaleString('es-CL') : '—') + '</td>' +
    '</tr>';
  }).join('');

  return '<div style="font-size:12px;color:var(--text-muted);line-height:1.55;margin-bottom:12px">' +
      'Máximos alcanzables por zona de edificación, considerando las tablas de densificación ' +
      '(no la Tabla Base). Ordenado por constructibilidad.' +
    '</div>' +
    '<table class="prc-rank-table">' +
      '<thead><tr><th>Zona</th><th class="num">CC máx</th><th class="num">Pisos</th><th class="num">hab/ha</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>' +
    '<div class="prc-foot">' +
      'Las tablas de densificación solo aplican si el proyecto cumple las condiciones del Capítulo V ' +
      '(área libre, antejardines, cableado subterráneo, accesibilidad, tamaño predial, etc.).<br>' +
      'Click en una fila para aislar esa zona en el mapa.' +
    '</div>';
}

function wireRanking(){
  document.querySelectorAll('.prc-rank-table tbody tr').forEach(function(tr){
    tr.addEventListener('click', function(){
      var edif = tr.getAttribute('data-edif');
      // Aislar en el mapa las zonas con esa edificación
      if(prcLayer){
        prcLayer.setStyle(function(f){
          var match = splitZona(f.properties.zona).edif === edif;
          return {
            color: colorDe(f.properties.zona),
            weight: match ? 1.5 : 0,
            opacity: match ? 1 : 0,
            fillColor: colorDe(f.properties.zona),
            fillOpacity: match ? 0.5 : 0
          };
        });
      }
      // Zoom al conjunto
      var bounds = null;
      prcLayer.eachLayer(function(l){
        if(splitZona(l.feature.properties.zona).edif === edif){
          bounds = bounds ? bounds.extend(l.getBounds()) : l.getBounds();
        }
      });
      if(bounds) map.fitBounds(bounds, { padding:[60,60] });
    });
  });
}

/* --- Vista: detalle de una zona --- */
function renderZona(feature){
  var p = feature.properties;
  var sp = splitZona(p.zona);
  var n = normasDe(p.zona);
  var fam = PRC_FAMILIAS[familiaDe(p.zona)];
  var m = n ? maximosDe(p.zona) : null;

  var html = '';

  html += '<div class="prc-zona-code">' + esc(p.zona) + '</div>';
  html += '<div class="prc-zona-name">' + esc(p.nombre) + '</div>';
  html += '<span class="prc-fam-badge" style="background:' + fam.color + '">' + fam.label + '</span>';

  // Máximos
  if(m && (m.cc || m.pisos)){
    html += '<div class="prc-max-grid">' +
      '<div class="prc-max"><div class="prc-max-label">CC máx</div><div class="prc-max-val">' + fmtCoef(m.cc || 0) + '</div></div>' +
      '<div class="prc-max"><div class="prc-max-label">Altura máx</div><div class="prc-max-val">' + (m.pisos || '—') + ' <span>pisos</span></div></div>' +
      '<div class="prc-max"><div class="prc-max-label">Densidad</div><div class="prc-max-val">' + (m.dens ? m.dens.toLocaleString('es-CL') : '—') + ' <span>hab/ha</span></div></div>' +
    '</div>';
  }

  // Uso de suelo (sigla)
  if(PRC_USOS[sp.uso]){
    html += '<div class="prc-section-lbl">Zona de uso de suelo · ' + esc(sp.uso) + '</div>';
    html += '<div style="font-size:12px;color:var(--text-muted);line-height:1.5">' + esc(PRC_USOS[sp.uso]) + '</div>';
  }

  // Tablas de normas
  html += '<div class="prc-section-lbl">Normas urbanísticas · ' + esc(sp.edif) + '</div>';
  if(!n){
    html += '<div style="font-size:12px;color:var(--text-faint);font-style:italic">Sin normas cargadas para esta zona de edificación.</div>';
  } else if(!n.tablas.length){
    html += '<div style="font-size:12px;color:var(--text-faint);font-style:italic">Esta zona no tiene tabla de normas propia en el Art. 38.</div>';
  } else {
    n.tablas.forEach(function(tb, i){
      var esBase = (tb.t === 'A');
      html += '<div class="prc-tabla' + (i === 0 ? ' open' : '') + '">' +
        '<div class="prc-tabla-head">' +
          '<span class="prc-tabla-tag' + (esBase ? ' base' : '') + '">' + tb.t + '</span>' +
          '<span class="prc-tabla-label">' + esc(tb.label) + '</span>' +
          '<span class="prc-tabla-arrow">▶</span>' +
        '</div>' +
        '<div class="prc-tabla-body">' +
          fila('Altura máxima', fmtAltura(tb), true) +
          fila('Coef. constructibilidad', fmtCoef(tb.cc), true) +
          fila('Coef. ocupación de suelo', fmtCoef(tb.cos)) +
          fila('Densidad bruta máx.', tb.dens || '—') +
          fila('Subdivisión predial mín.', tb.predio || '—') +
          (tb.al !== undefined && tb.al !== null ? fila('Coef. área libre', fmtCoef(tb.al)) : '') +
          fila('Rasante', tb.rasante || '—') +
          fila('Antejardín', tb.antejardin || '—') +
          fila('Distanciamiento', tb.dist || '—') +
          fila('Adosamiento', tb.ados || '—') +
          fila('Agrupamiento', tb.agrup || '—') +
          (tb.nota ? '<div class="prc-nota">' + esc(tb.nota) + '</div>' : '') +
        '</div>' +
      '</div>';
    });
  }

  // Notas de la zona
  if(n && n.notas && n.notas.length){
    html += '<div class="prc-section-lbl">Condiciones y sectores especiales</div>';
    n.notas.forEach(function(nt){
      html += '<div class="prc-nota" style="margin-top:0;margin-bottom:6px">' + esc(nt) + '</div>';
    });
  }

  // Usos de suelo del polígono (vienen en el GeoJSON)
  html += '<div class="prc-section-lbl">Usos de suelo</div>';
  if(p.upref) html += '<div class="prc-uso-box prc-uso-pref"><b>Preferente</b>' + esc(p.upref) + '</div>';
  if(p.uperm) html += '<div class="prc-uso-box prc-uso-perm"><b>Permitidos</b>' + esc(p.uperm) + '</div>';
  if(p.uproh) html += '<div class="prc-uso-box prc-uso-proh"><b>Prohibidos</b>' + esc(p.uproh) + '</div>';
  if(!p.upref && !p.uperm && !p.uproh){
    html += '<div style="font-size:12px;color:var(--text-faint);font-style:italic">Sin detalle de usos en la capa.</div>';
  }

  // Incentivos generales
  html += '<div class="prc-section-lbl">Incentivos generales (Cap. IV)</div>';
  html += '<div class="prc-tabla"><div class="prc-tabla-head">' +
      '<span class="prc-tabla-tag base">+</span>' +
      '<span class="prc-tabla-label">Incrementos de norma aplicables</span>' +
      '<span class="prc-tabla-arrow">▶</span>' +
    '</div><div class="prc-tabla-body">' +
      PRC_INCENTIVOS.map(function(x){
        return '<div style="padding:7px 0;border-bottom:1px solid var(--border)">' +
          '<div style="font-family:var(--font-mono);font-size:10px;color:var(--accent);margin-bottom:3px">' + esc(x[0]) + '</div>' +
          '<div style="font-size:11.5px;line-height:1.5;color:var(--text-muted)">' + esc(x[1]) + '</div>' +
        '</div>';
      }).join('') +
    '</div></div>';

  // Estacionamientos
  html += '<div class="prc-tabla"><div class="prc-tabla-head">' +
      '<span class="prc-tabla-tag base">P</span>' +
      '<span class="prc-tabla-label">Estacionamientos mínimos · vivienda (Art. 15)</span>' +
      '<span class="prc-tabla-arrow">▶</span>' +
    '</div><div class="prc-tabla-body">' +
      PRC_ESTACIONAMIENTOS.map(function(x){ return fila(x[0], x[1]); }).join('') +
    '</div></div>';

  html += '<div class="prc-foot">' +
    'Referencial. Verificar siempre contra la Ordenanza vigente y el certificado de informaciones previas de la DOM.' +
    (p.url ? '<br><a href="' + esc(p.url) + '" target="_blank" rel="noopener">Ver ficha en Observatorio Urbano ↗</a>' : '') +
  '</div>';

  return html;
}

function fila(k, v, hi){
  return '<div class="prc-row">' +
    '<span class="prc-row-k">' + esc(k) + '</span>' +
    '<span class="prc-row-v' + (hi ? ' hi' : '') + '">' + esc(v) + '</span>' +
  '</div>';
}

function wireZona(){
  document.querySelectorAll('#prc-body .prc-tabla-head').forEach(function(h){
    h.addEventListener('click', function(){
      h.parentElement.classList.toggle('open');
    });
  });
}


/* ===========================================================================
   9. INTEGRACIÓN CON EL DETALLE DEL TERRENO
   =========================================================================== */

function injectTerrenoSection(t){
  var cont = document.getElementById('detail-content');
  if(!cont || !t) return;

  var comuna = (typeof g === 'function') ? g(t, 'comuna') : '';
  if(!PRC_FUENTES[comuna]) return;          // comuna sin PRC cargado
  if(!t._lat || !t._lng) return;

  var wrap = document.createElement('div');
  wrap.id = 'prc-terr-section';
  wrap.innerHTML =
    '<div class="section-label">Normativa · PRC</div>' +
    '<div id="prc-terr-content">' +
      '<div style="display:flex;align-items:center;gap:8px;font-size:12px;font-family:var(--font-mono);color:var(--text-faint);padding:10px 0">' +
        '<div class="spinner" style="width:14px;height:14px;border-width:2px"></div>' +
        '<span>Buscando zona…</span>' +
      '</div>' +
    '</div>';

  // Insertarlo antes de la sección "Documentos" si existe; si no, al final
  cont.appendChild(wrap);

  var terrenoId = t._id;
  loadPRC(function(err){
    // Si el usuario ya cambió de terreno, no pisar el DOM
    if(selectedId !== terrenoId) return;
    var box = document.getElementById('prc-terr-content');
    if(!box) return;

    if(err){
      box.innerHTML = '<div class="no-data">No se pudo cargar la capa del PRC.</div>';
      return;
    }
    var f = findZonaAt(t._lat, t._lng);
    if(!f){
      box.innerHTML = '<div class="no-data">El punto no cae dentro de ninguna zona del PRC de ' + esc(comuna) + '. Revisa las coordenadas.</div>';
      return;
    }
    box.innerHTML = renderTerrenoCard(f, t);
    var btn = document.getElementById('prc-terr-open');
    if(btn){
      btn.addEventListener('click', function(){
        if(!prcVisible){
          buildLayer();
          prcLayer.addTo(map);
          if(prcLayer.bringToBack) prcLayer.bringToBack();
          prcVisible = true;
          setBtnState();
        }
        selectZona(f);
      });
    }
  });
}

function renderTerrenoCard(f, t){
  var p = f.properties;
  var n = normasDe(p.zona);
  var m = n ? maximosDe(p.zona) : null;
  var fam = PRC_FAMILIAS[familiaDe(p.zona)];

  // Cabida gruesa: m² del terreno × CC máx
  var cabida = (m && m.cc && t._m2) ? Math.round(t._m2 * m.cc) : null;

  var html = '<div class="prc-terr-card">' +
    '<div class="prc-terr-zona">' +
      '<span class="prc-rank-dot" style="background:' + fam.color + '"></span>' + esc(p.zona) +
    '</div>' +
    '<div class="prc-terr-name">' + esc(p.nombre) + '</div>';

  if(m && (m.cc || m.pisos)){
    html += '<div class="prc-terr-grid">' +
      '<div class="prc-terr-cell"><div class="prc-terr-cell-lbl">CC máx</div><div class="prc-terr-cell-val">' + fmtCoef(m.cc || 0) + '</div></div>' +
      '<div class="prc-terr-cell"><div class="prc-terr-cell-lbl">Pisos máx</div><div class="prc-terr-cell-val">' + (m.pisos || '—') + '</div></div>' +
      '<div class="prc-terr-cell"><div class="prc-terr-cell-lbl">hab/ha</div><div class="prc-terr-cell-val" style="font-size:13px">' + (m.dens ? m.dens.toLocaleString('es-CL') : '—') + '</div></div>' +
    '</div>';
  }

  if(cabida){
    html += '<div class="prc-nota" style="margin-top:0;margin-bottom:10px">' +
      'Cabida bruta referencial: <strong>' + cabida.toLocaleString('es-CL') + ' m²</strong> ' +
      '(' + t._m2.toLocaleString('es-CL') + ' m² × CC ' + fmtCoef(m.cc) + '). ' +
      'No descuenta afectaciones de utilidad pública ni considera rasantes.' +
    '</div>';
  }

  html += '<button class="prc-terr-btn" id="prc-terr-open">' +
      '<span>Ver normas completas de la zona</span><span>→</span>' +
    '</button>' +
  '</div>';

  return html;
}


/* ===========================================================================
   10. ARRANQUE
   =========================================================================== */

function init(){
  if(typeof L === 'undefined' || typeof map === 'undefined' || !map){
    // El mapa aún no existe: reintentar
    return setTimeout(init, 150);
  }

  injectCSS();
  buildUI();

  // Engancharse al detalle del terreno sin tocar el código original
  if(typeof window.fillDetail === 'function'){
    var origFillDetail = window.fillDetail;
    window.fillDetail = function(t){
      origFillDetail.apply(this, arguments);
      try { injectTerrenoSection(t); }
      catch(e){ console.error('PRC: error al inyectar sección del terreno', e); }
    };
  }

  // Al cerrar el detalle, limpiar el resalte
  if(typeof window.closeDetail === 'function'){
    var origCloseDetail = window.closeDetail;
    window.closeDetail = function(){
      origCloseDetail.apply(this, arguments);
      clearHighlight();
    };
  }

  // Exponer por si se necesita desde consola
  window.PRC = {
    data: function(){ return prcData; },
    findZonaAt: findZonaAt,
    normas: PRC_NORMAS,
    toggle: togglePRC
  };
}

if(document.readyState === 'complete') init();
else window.addEventListener('load', init);

})();
