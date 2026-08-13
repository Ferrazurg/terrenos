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

   DATOS: los .geojson de cada comuna en la raíz del repo (ver PRC_COMUNAS).

   MULTI-COMUNA: el módulo soporta varias comunas a la vez. Cada una puede
   traer sus normas de dos formas distintas:
     - "lookup":   la geometría solo trae el código de zona; las normas viven
                   en una tabla aparte transcrita a mano desde la Ordenanza
                   (caso Las Condes, ver PRC_NORMAS).
     - "embebida": cada polígono ya trae sus propias normas como atributos
                   (caso Lo Barnechea — vienen directo del Sistema de
                   Información Territorial municipal).
   La función normasDe() detecta cuál usar según currentComuna.

   FUENTES:
     - Las Condes: Geoportal MINVU/IDE Chile (geometría) + Ordenanza PRC Las
       Condes, Texto Refundido incl. Mod. N°11 (Diario Oficial, oct. 2021),
       Artículo 38 (normas, transcritas a mano).
     - Lo Barnechea: Portal de datos abiertos Municipalidad de Lo Barnechea
       (SITMLB), capa "Zonificación y Normas Urbanísticas" — normas y
       geometría vienen juntas, actualización del PRC aprobada oct. 2025.

   ============================================================================
   CÓMO AGREGAR OTRA COMUNA MÁS ADELANTE:
     1. Bajar su GeoJSON (ideal: con normas embebidas) → guardarlo en la raíz.
     2. Agregarlo a PRC_COMUNAS abajo.
     3. Si sus normas vienen en una tabla aparte (como Las Condes), transcribir
        a PRC_NORMAS y agregar la rama correspondiente en normasDe().
        Si vienen embebidas en cada polígono (como Lo Barnechea), escribir un
        adaptador tipo normasLB() que lea sus propios nombres de campo.
     4. Agregar su entrada en PRC_META (fuente de geometría/normas para el pie
        del panel).
   ============================================================================ */

(function(){
'use strict';

/* ===========================================================================
   1. CONFIGURACIÓN
   =========================================================================== */

// Comunas que tienen PRC cargado, y el archivo GeoJSON de cada una.
// Si el terreno no está en esta lista, simplemente no se busca su zona.
var PRC_COMUNAS = {
  'Las Condes':    'prc-lascondes.geojson',
  'Lo Barnechea':  'lobarnechea-zonificacion.geojson',
  'La Florida':    'prc-laflorida.geojson',
  'Colina':        'prc-colina.geojson',
  'Huechuraba':    'prc-huechuraba.geojson',
  'Providencia':   'prc-providencia.geojson',
  'Vitacura':      'prc-vitacura.geojson',
  'Ñuñoa':         'prc-nunoa.geojson'
};

// Metadata para el pie del panel (fuente de datos, mostrada según la comuna activa)
var PRC_META = {
  'Las Condes': {
    fuenteGeom:   'Geoportal MINVU / IDE Chile',
    fuenteNormas: 'Ordenanza PRC Las Condes, Texto Refundido incl. Modificación N°11 (oct. 2021)'
  },
  'Lo Barnechea': {
    fuenteGeom:   'Portal de datos abiertos Municipalidad de Lo Barnechea (SITMLB)',
    fuenteNormas: 'Capa "Zonificación y Normas Urbanísticas", PRC Lo Barnechea vigente (aprobado oct. 2025)'
  },
  'La Florida': {
    fuenteGeom:   'Geoportal MINVU / IDE Chile',
    fuenteNormas: 'Texto Refundido Ordenanza Local PRC La Florida, sept. 2016 (incl. Mod. N°1-11). Normas de edificación completas en zonas con norma conjunta (AV, ED, ESP, RI, R, PEDC-3 y Sector Centro). Zonas U-Vev/U-EC ("Uso de suelo (sin norma de edificación)"): solo uso de suelo — el Geoportal MINVU no publica el Plano PRLF-1 (edificación) como capa separada'
  },
  'Colina': {
    fuenteGeom:   'Geoportal MINVU / IDE Chile',
    fuenteNormas: 'Aún no transcritas — solo geometría y usos de suelo por ahora'
  },
  'Huechuraba': {
    fuenteGeom:   'Geoportal MINVU / IDE Chile',
    fuenteNormas: 'Aún no transcritas — solo geometría y usos de suelo por ahora'
  },
  'Providencia': {
    fuenteGeom:   'Geoportal MINVU / IDE Chile',
    fuenteNormas: 'Ordenanza Local Refundida PRCP 2007, incl. Modificación N°7 Barrio El Aguilucho (D.O. 29-05-2025)'
  },
  'Vitacura': {
    fuenteGeom:   'Geoportal MINVU / IDE Chile',
    fuenteNormas: 'Ordenanza PRC Vitacura, Texto Refundido base ene. 2008, refundido ago. 2019 / mar. 2020 (vigente)'
  },
  'Ñuñoa': {
    fuenteGeom:   'Geoportal MINVU / IDE Chile',
    fuenteNormas: 'Ordenanza PRC Ñuñoa, Texto Refundido por Asesoría Urbana, actualizado abr. 2025, incl. Fallo Corte de Apelaciones (D.O. 26-11-2024) y Enmienda N°1 (vigente desde 17-12-2024). OJO: la geometría del Geoportal MINVU usa varios códigos de zona previos a la Modificación N°18 (2019) — ver notas por zona'
  }
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
  usosolo:      { label:'Uso de suelo (sin norma de edificación)', color:'#6E7B8B', orden:7 },
  otro:         { label:'Sin clasificar',          color:'#9A948A', orden:8 }
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

/* Estacionamientos mínimos de vivienda (Art. 15) — útil para cabidas.
   Específico de la Ordenanza de Las Condes; solo se muestra para esa comuna. */
var PRC_ESTACIONAMIENTOS = [
  ['< 70 m² útiles', '1 por vivienda'],
  ['70 a < 110 m²', '1,5 por vivienda'],
  ['110 a < 140 m²', '2 por vivienda'],
  ['140 a < 180 m²', '2,5 por vivienda'],
  ['≥ 180 m²', '3 por vivienda']
];

/* ---------------------------------------------------------------------------
   PROVIDENCIA — NORMAS URBANÍSTICAS POR ZONA DE EDIFICACIÓN
   ---------------------------------------------------------------------------
   Fuente: Ordenanza Local Refundida PRCP 2007 (incl. 8 modificaciones,
   Mod. N°7 Barrio El Aguilucho, D.O. 29-05-2025), Título 4 (Cuadros 8-19),
   Cuadro 39 (densidades) y Art. 4.3.02 (zonas patrimoniales ZEP).

   IMPORTANTE: esta tabla es DELIBERADAMENTE SEPARADA de PRC_NORMAS (Las
   Condes) — varios códigos de Providencia (AV, ZE...) coinciden con códigos
   de Las Condes pero significan otra cosa. Nunca fusionar ambas tablas.

   A diferencia de Las Condes, Providencia no tiene "tablas de densificación"
   separadas de la base — cada zona trae una sola norma. Sí existen
   incentivos condicionales (Art. 4.2.28), listados aparte en
   PRC_INCENTIVOS_PROVIDENCIA.
   --------------------------------------------------------------------------- */
var PRC_NORMAS_PROVIDENCIA = {
  'EC3': {
    nombre:'Zona de Edificación Continua, de máximo 3 pisos', familia:'baja',
    tablas:[{ t:'A', label:'Base', dens:'720 hab/ha · 180 viv/ha', predio:'800 m²',
      cc:1.10, cos:0.60, rasante:'Art. 2.6.3 OGUC', pisos:3, metros:10.00,
      antejardin:'Variable (Art. 4.1.06)', dist:'Art. 4.2.19', ados:'—', agrup:'Continuo' }],
    notas:[]
  },
  'EC5': {
    nombre:'Zona de Edificación Continua, de máximo 5 pisos', familia:'media',
    tablas:[{ t:'A', label:'Base', dens:'1.160 hab/ha · 290 viv/ha', predio:'800 m²',
      cc:1.80, cos:0.60, rasante:'Art. 2.6.3 OGUC', pisos:5, metros:16.00,
      antejardin:'Variable (Art. 4.1.06)', dist:'Art. 4.2.19', ados:'—', agrup:'Continuo' }],
    notas:[]
  },
  'EC7': {
    nombre:'Zona de Edificación Continua, de máximo 7 pisos', familia:'media',
    tablas:[{ t:'A', label:'Base', dens:'1.620 hab/ha · 405 viv/ha', predio:'800 m²',
      cc:2.50, cos:0.60, rasante:'Art. 2.6.3 OGUC', pisos:7, metros:22.00,
      antejardin:'Variable (Art. 4.1.06)', dist:'Art. 4.2.19', ados:'—', agrup:'Continuo' }],
    notas:[]
  },
  'EC12': {
    nombre:'Zona de Edificación Continua, de máximo 12 pisos', familia:'alta',
    tablas:[{ t:'A', label:'Base', dens:'2.800 hab/ha · 700 viv/ha', predio:'800 m²',
      cc:4.30, cos:0.60, rasante:'Art. 2.6.3 OGUC', pisos:12, metros:37.00,
      antejardin:'Variable (Art. 4.1.06)', dist:'Art. 4.2.19', ados:'—', agrup:'Continuo' }],
    notas:[]
  },
  'E5(C+A)': {
    nombre:'Zona de Edificación de máx. 5 pisos, Continua más Aislada', familia:'media',
    tablas:[
      { t:'A', label:'Cuerpo continuo', dens:'880 hab/ha · 220 viv/ha', predio:'800 m²',
        cc:1.20, cos:0.60, pisos:2, metros:6.00, rasante:'Art. 2.6.3 OGUC',
        antejardin:'Sin antejardín', dist:'Art. 4.2.19', ados:'Art. 4.2.14/4.2.15', agrup:'Continuo' },
      { t:'B', label:'Cuerpo aislado sobre el continuo', dens:'880 hab/ha · 220 viv/ha', predio:'800 m²',
        cc:1.20, cos:0.40, pisos:5, metros:15.00, rasante:'Art. 2.6.3 OGUC',
        antejardin:'Sin antejardín', dist:'Art. 4.2.19', ados:'—', agrup:'Aislado, retirado 3 m del continuo' }
    ],
    notas:['Zona con dos cuerpos: uno continuo (máx. 2 pisos/6 m) y uno aislado sobre o tras él, hasta 5 pisos/15 m totales. Los CC de ambos cuerpos son independientes y no se pueden traspasar entre sí (Art. 4.2.10).']
  },
  'EC2+A8': {
    nombre:'Zona de Edif. Continua, de máx. 2 pisos, más Aislada de máx. 8 pisos', familia:'alta',
    tablas:[
      { t:'A', label:'Cuerpo continuo', dens:'1.040 hab/ha · 260 viv/ha', predio:'800 m²',
        cc:1.20, cos:0.60, pisos:2, metros:7.00, rasante:'Art. 2.6.3 OGUC',
        antejardin:'Variable (Art. 4.1.06)', dist:'Art. 4.2.19', ados:'—', agrup:'Continuo' },
      { t:'B', label:'Cuerpo aislado', dens:'1.040 hab/ha · 260 viv/ha', predio:'800 m²',
        cc:1.60, cos:0.40, pisos:8, metros:28.00, rasante:'Art. 2.6.3 OGUC',
        antejardin:'Variable (Art. 4.1.06)', dist:'Art. 4.2.19', ados:'—', agrup:'Aislado, hasta 10 pisos / 36 m total' }
    ],
    notas:[]
  },
  'EC2+A5': {
    nombre:'Continua + Aislada (código sin tabla propia en la Ordenanza vigente)', familia:'alta',
    tablas:[
      { t:'A', label:'Referencia: EC2+A8 (más cercana)', dens:'1.040 hab/ha · 260 viv/ha (ref.)', predio:'800 m²',
        cc:1.60, cos:0.40, pisos:8, metros:28.00, rasante:'Art. 2.6.3 OGUC',
        antejardin:'Variable', dist:'Art. 4.2.19', ados:'—', agrup:'Continua + Aislada',
        nota:'ADVERTENCIA: "EC2+A5" no aparece en el Título 4 de la Ordenanza vigente (solo existe EC2+A8, Art. 4.3.08). Puede ser una designación de una versión anterior del plano que no se actualizó. Verificar directamente con la DOM de Providencia antes de usar este dato.' }
    ],
    notas:['Código presente en la capa de zonificación pero sin artículo correspondiente en el texto refundido vigente (mayo 2025). No usar para cálculos de cabida sin confirmar antes con la Municipalidad.']
  },
  'EC3+AL': {
    nombre:'Zona de Edif. Continua, de máx. 3 pisos, más Aislada Libre', familia:'alta',
    tablas:[
      { t:'A', label:'Cuerpo continuo', dens:'1.040 hab/ha · 260 viv/ha', predio:'800 m²',
        cc:3.00, cos:1.00, pisos:3, metros:10.50, rasante:'Art. 2.6.3 OGUC',
        antejardin:'Variable (Art. 4.1.06)', dist:'Art. 4.2.19', ados:'—', agrup:'Continuo' },
      { t:'B', label:'Cuerpo aislado (sin límite de altura)', dens:'1.040 hab/ha · 260 viv/ha', predio:'800 m²',
        cc:4.00, cos:0.40, pisos:null, metros:null, rasante:'Art. 2.6.3 OGUC',
        antejardin:'Variable', dist:'Art. 4.2.19', ados:'—', agrup:'Aislado, altura libre',
        nota:'Sin límite normado de pisos/metros — se rige solo por CC, COS y rasante.' }
    ],
    notas:['Premio a galerías interiores que unan dos calles (Art. 3.3.06): agrega superficie adicional sobre el CC ya generoso de esta zona.']
  },
  'EA3': {
    nombre:'Zona de Edificación Aislada, de máximo 3 pisos', familia:'baja',
    tablas:[{ t:'A', label:'Base', dens:'440 hab/ha · 110 viv/ha', predio:'800 m²',
      cc:0.70, cos:0.40, rasante:'Art. 2.6.3 OGUC', pisos:3, metros:10.00,
      antejardin:'Variable (Art. 4.1.06)', dist:'Art. 4.2.19', ados:'Art. 4.2.14/4.2.15', agrup:'Aislado' }],
    notas:['Incentivos condicionales del Art. 4.2.28 aplican en esta zona (ver sección de incentivos).']
  },
  'E3': {
    nombre:'Zona de Edificación de máximo 3 pisos; Aislada, Pareada o Continua', familia:'baja',
    tablas:[{ t:'A', label:'Base', dens:'720 hab/ha · 180 viv/ha', predio:'800 m²',
      cc:1.10, cos:0.60, rasante:'Art. 2.6.3 OGUC', pisos:3, metros:9.00,
      antejardin:'3 m', dist:'Art. 4.2.19', ados:'Art. 4.2.14/4.2.15', agrup:'Aislado, Pareado o Continuo' }],
    notas:[
      'Zona incorporada por la Modificación N°7 Barrio El Aguilucho (D.O. 29-05-2025) — verificar que el terreno esté dentro del polígono de esa modificación.',
      'Incentivos condicionales del Art. 4.2.28 aplican en esta zona (ver sección de incentivos).'
    ]
  },
  'EA5': {
    nombre:'Zona de Edificación Aislada, de máximo 5 pisos', familia:'media',
    tablas:[{ t:'A', label:'Base', dens:'780 hab/ha · 195 viv/ha', predio:'800 m²',
      cc:1.20, cos:0.40, rasante:'Art. 2.6.3 OGUC', pisos:5, metros:16.00,
      antejardin:'Variable (Art. 4.1.06)', dist:'Art. 4.2.19', ados:'No permite (ver EA5 pa)', agrup:'Aislado' }],
    notas:['Incentivos condicionales del Art. 4.2.28 aplican en esta zona (ver sección de incentivos).']
  },
  'EA5 pa': {
    nombre:'Zona de Edificación Aislada, de máximo 5 pisos, permite adosamiento', familia:'media',
    tablas:[{ t:'A', label:'Base + adosamiento', dens:'780 hab/ha · 195 viv/ha', predio:'800 m²',
      cc:1.70, cos:0.40, rasante:'Art. 2.6.3 OGUC', pisos:5, metros:16.00,
      antejardin:'Variable (Art. 4.1.06)', dist:'Art. 4.2.19', ados:'Hasta 2 pisos/7 m (Art. 2.6.2 OGUC)', agrup:'Aislado, permite adosamiento',
      nota:'CC=1,20 base + 0,50 adicional exclusivo para el cuerpo adosado no residencial, con COS máx. 0,60 en esas 2 plantas.' }],
    notas:['Incentivos condicionales del Art. 4.2.28 aplican en esta zona (ver sección de incentivos).']
  },
  'EA7': {
    nombre:'Zona de Edificación Aislada, de máximo 7 pisos', familia:'media',
    tablas:[{ t:'A', label:'Base', dens:'1.040 hab/ha · 260 viv/ha', predio:'800 m²',
      cc:1.60, cos:0.20, rasante:'Art. 2.6.3 OGUC', pisos:7, metros:22.00,
      antejardin:'Variable (Art. 4.1.06)', dist:'Art. 4.2.19', ados:'No permite (ver EA7 pa)', agrup:'Aislado' }],
    notas:[]
  },
  'EA7 pa': {
    nombre:'Zona de Edificación Aislada, de máximo 7 pisos, permite adosamiento', familia:'media',
    tablas:[{ t:'A', label:'Base + adosamiento', dens:'1.040 hab/ha · 260 viv/ha', predio:'800 m²',
      cc:2.20, cos:0.20, rasante:'Art. 2.6.3 OGUC', pisos:7, metros:22.00,
      antejardin:'Variable (Art. 4.1.06)', dist:'Art. 4.2.19', ados:'Hasta 2 pisos/7 m (Art. 2.6.2 OGUC)', agrup:'Aislado, permite adosamiento',
      nota:'CC=1,60 base + 0,60 adicional exclusivo para el cuerpo adosado no residencial, con COS máx. 0,60 en esas 2 plantas.' }],
    notas:['Incentivos condicionales del Art. 4.2.28 aplican en esta zona (ver sección de incentivos).']
  },
  'EA12': {
    nombre:'Zona de Edificación Aislada, de máximo 12 pisos', familia:'alta',
    tablas:[{ t:'A', label:'Base', dens:'1.100 hab/ha · 275 viv/ha', predio:'800 m²',
      cc:1.70, cos:0.20, rasante:'Art. 2.6.3 OGUC', pisos:12, metros:37.00,
      antejardin:'Variable (Art. 4.1.06)', dist:'Art. 4.2.19', ados:'No permite (ver EA12 pa)', agrup:'Aislado' }],
    notas:[]
  },
  'EA12 pa': {
    nombre:'Zona de Edificación Aislada, de máximo 12 pisos, permite adosamiento', familia:'alta',
    tablas:[{ t:'A', label:'Base + adosamiento', dens:'1.100 hab/ha · 275 viv/ha', predio:'800 m²',
      cc:2.30, cos:0.20, rasante:'Art. 2.6.3 OGUC', pisos:12, metros:37.00,
      antejardin:'Variable (Art. 4.1.06)', dist:'Art. 4.2.19', ados:'Hasta 2 pisos/7 m (Art. 2.6.2 OGUC)', agrup:'Aislado, permite adosamiento',
      nota:'CC=1,70 base + 0,60 adicional exclusivo para el cuerpo adosado no residencial, con COS máx. 0,60 en esas 2 plantas.' }],
    notas:[]
  },
  'EAL pa': {
    nombre:'Zona de Edificación Aislada Libre, permite adosamiento', familia:'alta',
    tablas:[{ t:'A', label:'Base (altura libre) + adosamiento', dens:'1.040 hab/ha · 260 viv/ha', predio:'800 m²',
      cc:3.50, cos:0.20, rasante:'Art. 2.6.3 OGUC', pisos:null, metros:null,
      antejardin:'Variable (Art. 4.1.06)', dist:'Art. 4.2.19', ados:'Hasta 2 pisos/7 m (Art. 2.6.2 OGUC)', agrup:'Aislado, altura libre, permite adosamiento',
      nota:'CC=2,90 base sin límite de altura + 0,60 adicional exclusivo para el cuerpo adosado no residencial. Sin límite normado de pisos/metros para el cuerpo aislado.' }],
    notas:[]
  },

  /* ---------- ZONAS PATRIMONIALES (Art. 4.3.02) ---------- */
  'ZEP CE1': {
    nombre:'Zona Edif. Patrimonial · Continua de Altura Existente 1', familia:'patrimonial',
    tablas:[{ t:'A', label:'Base', dens:'—', predio:'—', cc:null, cos:null,
      rasante:'Art. 2.6.3 OGUC', pisos:null, metros:null, antejardin:'Existente', dist:'—',
      ados:'—', agrup:'Continuo', nota:'Debe respetar la altura existente del inmueble o conjunto protegido.' }],
    notas:['Aplica a Monumentos Históricos, Zonas Típicas, ZCH e ICH según los Cuadros 20-23. Requiere autorización previa del Consejo de Monumentos Nacionales o la SEREMI MINVU según corresponda.']
  },
  'ZEP CE2': {
    nombre:'Zona Edif. Patrimonial · Continua de Altura Existente 2', familia:'patrimonial',
    tablas:[{ t:'A', label:'Base', dens:'—', predio:'—', cc:null, cos:0.80,
      rasante:'Art. 2.6.3 OGUC', pisos:null, metros:null, antejardin:'Existente', dist:'—',
      ados:'—', agrup:'Continuo', nota:'Debe respetar la altura existente del inmueble o conjunto protegido.' }],
    notas:['Aplica a Monumentos Históricos, Zonas Típicas, ZCH e ICH según los Cuadros 20-23. Requiere autorización previa del Consejo de Monumentos Nacionales o la SEREMI MINVU según corresponda.']
  },
  'ZEP AE': {
    nombre:'Zona Edif. Patrimonial · Aislada de Altura Existente', familia:'patrimonial',
    tablas:[{ t:'A', label:'Base', dens:'—', predio:'—', cc:null, cos:0.60,
      rasante:'Art. 2.6.3 OGUC', pisos:null, metros:null, antejardin:'Existente', dist:'—',
      ados:'—', agrup:'Aislado', nota:'Debe respetar la altura existente del inmueble o conjunto protegido.' }],
    notas:['Aplica a Monumentos Históricos, Zonas Típicas, ZCH e ICH según los Cuadros 20-23. Requiere autorización previa del Consejo de Monumentos Nacionales o la SEREMI MINVU según corresponda.']
  },
  'ZEP A3': {
    nombre:'Zona Edif. Patrimonial · Aislada de Máximo 3 Pisos', familia:'patrimonial',
    tablas:[{ t:'A', label:'Base', dens:'195 viv/ha', predio:'—', cc:1.20, cos:0.60,
      rasante:'Art. 2.6.3 OGUC', pisos:3, metros:9.00, antejardin:'Existente', dist:'—',
      ados:'—', agrup:'Aislado, Pareado o Continuo' }],
    notas:['Aplica a Monumentos Históricos, Zonas Típicas, ZCH e ICH según los Cuadros 20-23. Requiere autorización previa del Consejo de Monumentos Nacionales o la SEREMI MINVU según corresponda.']
  },
  'ZEP A4': {
    nombre:'Zona Edif. Patrimonial · Aislada de Máximo 4 Pisos', familia:'patrimonial',
    tablas:[{ t:'A', label:'Base', dens:'335 viv/ha', predio:'—', cc:2.00, cos:0.50,
      rasante:'Art. 2.6.3 OGUC', pisos:4, metros:12.00, antejardin:'Existente', dist:'—',
      ados:'—', agrup:'Aislado' }],
    notas:['Aplica a Monumentos Históricos, Zonas Típicas, ZCH e ICH según los Cuadros 20-23.']
  },
  'ZEP A7': {
    nombre:'Zona Edif. Patrimonial · Aislada de Máximo 7 Pisos', familia:'patrimonial',
    tablas:[{ t:'A', label:'Base', dens:'350 viv/ha', predio:'—', cc:2.10, cos:0.40,
      rasante:'Art. 2.6.3 OGUC', pisos:7, metros:21.00, antejardin:'Existente', dist:'—',
      ados:'—', agrup:'Aislado' }],
    notas:['Aplica a Monumentos Históricos, Zonas Típicas, ZCH e ICH según los Cuadros 20-23.']
  },

  /* ---------- ZONAS METROPOLITANAS (Art. 5.6.03) ---------- */
  'ZEMoI': {
    nombre:'Zona de Equipamiento Metropolitano o Intercomunal', familia:'equipamiento',
    tablas:[{ t:'A', label:'Base', dens:'440 hab/ha · 110 viv/ha', predio:'2.500 m²',
      cc:2.00, cos:0.40, rasante:'Art. 2.6.3 OGUC', pisos:5, metros:17.50,
      antejardin:'5 m', dist:'Art. 4.2.19', ados:'—', agrup:'Aislado' }],
    notas:[
      'Hospital del Salvador / Instituto Nacional del Tórax e Instituto de Geriatría, y Hospital Luis Calvo Mackenna, tienen incentivos normativos específicos del Art. 5.6.05 (hasta 8 pisos/28 m si habilitan área libre de uso público). Consultar caso a caso.',
      'Usos permitidos y prohibidos definidos en el Art. 5.6.04 — equipamiento de servicios, salud, educación, científico, seguridad, social, culto y cultura principalmente; comercio y actividades productivas mayormente restringidas o prohibidas.'
    ]
  },
  'ZIM': {
    nombre:'Zona de Interés Metropolitano', familia:'equipamiento',
    tablas:[{ t:'A', label:'Base', dens:'440 hab/ha · 110 viv/ha', predio:'2.500 m²',
      cc:2.00, cos:0.40, rasante:'Art. 2.6.3 OGUC', pisos:5, metros:17.50,
      antejardin:'5 m', dist:'Art. 4.2.19', ados:'—', agrup:'Aislado' }],
    notas:['Usos permitidos y prohibidos definidos en el Art. 5.6.04 — equipamiento de servicios, salud, educación, científico, seguridad, social, culto y cultura principalmente; comercio y actividades productivas mayormente restringidas o prohibidas.']
  },

  /* ---------- PREDIOS ESPECIALES (Art. 4.3.15) ---------- */
  'IP': {
    nombre:'Predio Especial (Art. 4.3.15)', familia:'otro',
    tablas:[],
    notas:['Predios menores a 800 m² inscritos antes de la publicación del PRCP y rodeados por edificios de 6+ pisos: pueden ampliarse hasta 3 pisos/10,5 m, COS 0,50, CC 1,50 máximo, o construir según las normas nuevas de su zona. Requiere verificación caso a caso con la DOM — no tiene una tabla numérica fija.']
  }
};

/* Incentivos condicionales de Providencia (Art. 4.2.28) — solo aplican en
   E5(C+A), E3, EA3, EA5, EA5/pa y EA7/pa, y algunos exigen estar dentro del
   polígono de la Modificación N°7 Barrio El Aguilucho. */
var PRC_INCENTIVOS_PROVIDENCIA = [
  ['Sustentabilidad de la edificación', 'Con Certificación de Vivienda Sustentable (CVS): +30% de coeficiente de constructibilidad.'],
  ['Aumento de superficie vegetal', 'Techos verdes, área libre plantada o antejardín abierto al público, según la zona: +20% de la densidad máxima permitida.'],
  ['Integración social', 'Con al menos 20% de las viviendas del proyecto destinadas a vivienda de interés público (MINVU): +30% de densidad y +30% de CC exclusivo para esas unidades, sin exigencia de estacionamiento para ellas.']
];

/* ---------------------------------------------------------------------------
   VITACURA — NORMAS URBANÍSTICAS POR ZONA DE EDIFICACIÓN
   ---------------------------------------------------------------------------
   Fuente: Ordenanza del Plan Regulador Comunal de Vitacura, Texto Refundido,
   Modificado, Actualizado y Sistematizado (Base enero 2008, refundido
   agosto 2019 / marzo 2020) — versión vigente confirmada en vitacura.cl
   (el "Informe Fundado de Revisión" 2025 es un estudio preliminar, aún no
   reemplaza esta Ordenanza). Cuadros 11 a 35 (Art. 41).

   Tabla SEPARADA de PRC_NORMAS y PRC_NORMAS_PROVIDENCIA — mismo criterio de
   seguridad ante colisión de códigos entre comunas.
   --------------------------------------------------------------------------- */
var PRC_NORMAS_VITACURA = {
  'E-Ab1': {
    nombre:'Edificación Aislada baja N°1', familia:'baja',
    tablas:[{ t:'A', label:'Base', dens:'17 hab/ha', predio:'4.000 m² (2.500 m² si pendiente < 20%)',
      cc:0.4, cos:0.2, rasante:'45°', pisos:2, metros:8.5, antejardin:'10 m',
      dist:'6 m', ados:'Prohibido', agrup:'Aislado' }],
    notas:[]
  },
  'E-Ab2': {
    nombre:'Edificación Aislada baja N°2', familia:'baja',
    tablas:[{ t:'A', label:'Base', dens:'32 hab/ha', predio:'1.000 m²',
      cc:0.5, cos:0.3, rasante:'60°', pisos:2, metros:8.5, antejardin:'5 m',
      dist:'4 m', ados:'Según OGUC', agrup:'Aislado' }],
    notas:[]
  },
  'E-Ab3': {
    nombre:'Edificación Aislada baja N°3', familia:'baja',
    tablas:[{ t:'A', label:'Base', dens:'56 hab/ha', predio:'500 m²',
      cc:0.8, cos:0.4, rasante:'60°', pisos:2, metros:8.5, antejardin:'5 m',
      dist:'Según OGUC', ados:'Según OGUC', agrup:'Aislado' }],
    notas:[]
  },
  'E-Ab4': {
    nombre:'Edificación Aislada baja N°4', familia:'baja',
    tablas:[{ t:'A', label:'Base', dens:'104 hab/ha', predio:'250 m²',
      cc:0.8, cos:0.4, rasante:'60°', pisos:2, metros:8.5, antejardin:'5 m',
      dist:'Según OGUC', ados:'Según OGUC', agrup:'Aislado' }],
    notas:[]
  },
  'E-Am1': {
    nombre:'Edificación Aislada media N°1', familia:'baja',
    tablas:[{ t:'A', label:'Base', dens:'216 hab/ha', predio:'1.000 m²',
      cc:0.8, cos:0.3, rasante:'60°', pisos:3, metros:10.5, antejardin:'7 m',
      dist:'Según OGUC', ados:'Según OGUC', agrup:'Aislado' }],
    notas:[]
  },
  'E-Am2': {
    nombre:'Edificación Aislada media N°2', familia:'baja',
    tablas:[{ t:'A', label:'Base', dens:'28 hab/ha', predio:'4.000 m² (2.500 m² si pendiente < 20%)',
      cc:0.4, cos:0.1, rasante:'60°', pisos:3, metros:10.5, antejardin:'15 m',
      dist:'10 m', ados:'Prohibido', agrup:'Aislado' }],
    notas:[]
  },
  'E-Am3': {
    nombre:'Edificación Aislada media N°3', familia:'media',
    tablas:[{ t:'A', label:'Base', dens:'328 hab/ha', predio:'1.500 m²',
      cc:1.0, cos:0.2, rasante:'70°', pisos:7, metros:24.5, antejardin:'7 m',
      dist:'8 m', ados:'Prohibido', agrup:'Aislado' }],
    notas:['Existe una subzona (E-Am3 sz) con las mismas normas de edificación pero densidad bruta máxima de 280 hab/ha en vez de 328 — verificar en el plano cuál aplica al predio.']
  },
  'E-Am4': {
    nombre:'Edificación Aislada media N°4', familia:'media',
    tablas:[{ t:'A', label:'Base', dens:'360 hab/ha', predio:'800 m²',
      cc:1.0, cos:0.4, rasante:'60°', pisos:5, metros:17.5,
      antejardin:'7 m', dist:'3 m + 1 m por cada piso sobre el 2° (máx. 6 m)',
      ados:'Según OGUC', agrup:'Aislado' }],
    notas:[]
  },
  'E-Am5': {
    nombre:'Edificación Aislada media N°5', familia:'media',
    tablas:[{ t:'A', label:'Base', dens:'508 hab/ha', predio:'1.200 m²',
      cc:1.6, cos:0.35, rasante:'70°', pisos:7, metros:24.5,
      antejardin:'7 m', dist:'3 m + 0,6 m por cada piso sobre el 2° (máx. 6 m)',
      ados:'Prohibido', agrup:'Aislado' }],
    notas:[]
  },
  'E-Am6': {
    nombre:'Edificación Aislada media N°6', familia:'media',
    tablas:[{ t:'A', label:'Base', dens:'84 hab/ha', predio:'4.000 m² (2.500 m² si pendiente < 20%)',
      cc:0.6, cos:0.15, rasante:'60°', pisos:4, metros:14, antejardin:'15 m',
      dist:'10 m', ados:'Prohibido', agrup:'Aislado' }],
    notas:[]
  },
  'E-Aa1': {
    nombre:'Edificación Aislada alta N°1', familia:'alta',
    tablas:[{ t:'A', label:'Base', dens:'612 hab/ha', predio:'1.500 m²',
      cc:2.0, cos:0.4, rasante:'70°', pisos:12, metros:42,
      antejardin:'7 m', dist:'3 m + 0,5 m por cada piso sobre el 2° (máx. 8 m)',
      ados:'Prohibido', agrup:'Aislado' }],
    notas:['El Art. 19 permite superar los 12 pisos incrementando el antejardín en la misma medida que la altura adicional perseguida — pero sin sobrepasar nunca la altura máxima en metros de esta tabla (42 m).']
  },
  'E-Aa2': {
    nombre:'Edificación Aislada alta N°2', familia:'alta',
    tablas:[{ t:'A', label:'Base', dens:'840 hab/ha', predio:'1.000 m²',
      cc:2.8, cos:0.4, rasante:'70°', pisos:null, metros:null,
      antejardin:'7 m', dist:'3 m + 0,5 m por cada piso sobre el 2° (máx. 10 m)',
      ados:'Según OGUC', agrup:'Aislado, altura libre',
      nota:'Sin límite normado de pisos/metros — se rige solo por CC, COS, rasante y el Art. 19 (altura ligada al ancho de la calle + antejardín).' }],
    notas:[]
  },
  'E-Ae1': {
    nombre:'Edificación Aislada especial N°1', familia:'baja',
    tablas:[{ t:'A', label:'Base', dens:'48 hab/ha', predio:'2.000 m²',
      cc:0.6, cos:0.2, rasante:'60°', pisos:3, metros:10.5, antejardin:'10 m',
      dist:'10 m', ados:'Prohibido', agrup:'Aislado' }],
    notas:[]
  },
  'E-Ae2': {
    nombre:'Edificación Aislada especial N°2', familia:'media',
    tablas:[{ t:'A', label:'Base', dens:'368 hab/ha', predio:'800 m²',
      cc:1.6, cos:0.35, rasante:'60°', pisos:4, metros:14, antejardin:'6 m',
      dist:'4 m', ados:'Según OGUC', agrup:'Aislado' }],
    notas:[]
  },
  'E-Ae3': {
    nombre:'Edificación Aislada especial N°3', familia:'baja',
    tablas:[{ t:'A', label:'Base', dens:'60 hab/ha', predio:'2.500 m²',
      cc:0.4, cos:0.2, rasante:'60°', pisos:3, metros:10.5, antejardin:'10 m',
      dist:'8 m', ados:'Prohibido', agrup:'Aislado' }],
    notas:['Existe una subzona (E-Ae3 sz) con CC 0,5, COS 0,5, altura 3 pisos/12 m y densidad 92 hab/ha — verificar en el plano cuál aplica.']
  },
  'E-Ae4': {
    nombre:'Edificación Aislada especial N°4', familia:'media',
    tablas:[{ t:'A', label:'Base', dens:'116 hab/ha', predio:'2.000 m²',
      cc:1.0, cos:0.2, rasante:'60°', pisos:4, metros:14, antejardin:'10 m',
      dist:'10 m', ados:'Prohibido', agrup:'Aislado' }],
    notas:[]
  },
  'E-Ae5': {
    nombre:'Edificación Aislada especial N°5', familia:'alta',
    tablas:[{ t:'A', label:'Base', dens:'796 hab/ha', predio:'1.500 m²',
      cc:1.8, cos:0.6, rasante:'70°', pisos:9, metros:31.5, antejardin:'7 m',
      dist:'8 m', ados:'Prohibido', agrup:'Aislado' }],
    notas:[]
  },
  'E-Ae6': {
    nombre:'Edificación Aislada especial N°6', familia:'alta',
    tablas:[{ t:'A', label:'Base', dens:'728 hab/ha', predio:'1.500 m²',
      cc:2.4, cos:0.6, rasante:'70°', pisos:null, metros:null, antejardin:'7 m',
      dist:'8 m', ados:'Prohibido', agrup:'Aislado, altura libre' }],
    notas:[]
  },
  'E-Ae7': {
    nombre:'Edificación Aislada especial N°7', familia:'alta',
    tablas:[{ t:'A', label:'Base', dens:'220 hab/ha', predio:'2.000 m²',
      cc:2.0, cos:0.15, rasante:'70°', pisos:12, metros:42, antejardin:'10 m',
      dist:'10 m', ados:'Prohibido', agrup:'Aislado' }],
    notas:[]
  },
  'E-Ae8': {
    nombre:'Edificación Aislada especial N°8', familia:'alta',
    tablas:[{ t:'A', label:'Base', dens:'412 hab/ha', predio:'2.500 m²',
      cc:2.0, cos:0.2, rasante:'70°', pisos:12, metros:42, antejardin:'10 m',
      dist:'10 m', ados:'Prohibido', agrup:'Aislado' }],
    notas:[]
  },
  'E-Ae9': {
    nombre:'Edificación Aislada especial N°9', familia:'media',
    tablas:[{ t:'A', label:'Base', dens:'156 hab/ha', predio:'2.000 m²',
      cc:1.0, cos:0.15, rasante:'70°', pisos:6, metros:21, antejardin:'10 m',
      dist:'10 m', ados:'Prohibido', agrup:'Aislado' }],
    notas:[]
  },
  'E-Ae10': {
    nombre:'Edificación Aislada especial N°10', familia:'media',
    tablas:[{ t:'A', label:'Base', dens:'116 hab/ha', predio:'2.000 m²',
      cc:0.8, cos:0.2, rasante:'70°', pisos:5, metros:17.5, antejardin:'10 m',
      dist:'10 m', ados:'Prohibido', agrup:'Aislado' }],
    notas:[]
  },

  /* ---------- ZONAS ESPECIALES (parques, áreas verdes) ---------- */
  'E-e2': {
    nombre:'Edificación Especial N°2 · Parques Metropolitanos', familia:'verde',
    tablas:[{ t:'A', label:'Normas complementarias', dens:'—', predio:'—', cc:null, cos:null,
      rasante:'60°', pisos:null, metros:9, antejardin:'20 m', dist:'20 m',
      ados:'No se permite', agrup:'—' }],
    notas:['Parque Metropolitano San Cristóbal y Parque del Río Mapocho. Se rige principalmente por el Art. 5.2.2 de la Ordenanza del PRMS; estas son solo normas complementarias del PRC de Vitacura para el sector oriente del Puente Centenario.']
  },
  'E-e3': {
    nombre:'Edificación Especial N°3 · Parques Intercomunales', familia:'verde',
    tablas:[{ t:'A', label:'Normas complementarias', dens:'—', predio:'Existente', cc:null, cos:null,
      rasante:'—', pisos:null, metros:3.5, antejardin:'10 m', dist:'20 m',
      ados:'No se permite', agrup:'—' }],
    notas:['Incluye Parques (Naciones Unidas, Cuauhtémoc), Cerros Isla (parte de Cerro Alvarado y Cerro Manquehue) y Avenidas Parque (Alonso de Córdova, Américo Vespucio Norte, Bicentenario, Luis Pasteur Norte, Nueva Costanera, etc). Se rige principalmente por el Art. 5.2.3 de la Ordenanza del PRMS.']
  },
  'E-e4': {
    nombre:'Edificación Especial N°4 · Áreas Verdes Complementarias', familia:'equipamiento',
    tablas:[{ t:'A', label:'Base', dens:'—', predio:'Existente', cc:0.30, cos:0.15, al:0.70,
      rasante:'60°', pisos:3, metros:10.5, antejardin:'10 m (variable en Club de Golf Sport Francés)',
      dist:'10 m', ados:'Según OGUC', agrup:'Aislado' }],
    notas:[
      'Equipamiento recreacional-deportivo existente: clubes de polo, de golf, estadios (Banco de Chile, Croata, Manquehue, Sirio, Instituto Nacional, Santa Úrsula) y clubes de oficiales.',
      'El 20% de la superficie del predio puede destinarse a otros usos con normas propias, definidas caso a caso mediante un seccional específico.'
    ]
  }
};

/* ---------------------------------------------------------------------------
   LA FLORIDA — NORMAS URBANÍSTICAS
   ---------------------------------------------------------------------------
   Fuente: Texto Refundido Ordenanza Local PRC La Florida, Septiembre 2016
   (incluye Modificaciones N°1 a N°11).

   OJO — Esta comuna es distinta a las demás ya cargadas. El GeoJSON que
   tenemos (Plano PRLF-2, "usos de suelo") NO trae el plano de "áreas de
   edificación" (E-AB1, E-AB2... Art. 26), que en la Ordenanza va en un plano
   aparte (PRLF-1) y se superpone al de usos de suelo. Por eso:
     - Las zonas U-Vev1..4 y U-EC1/3/4 SOLO traen norma de uso de suelo (ya
       vienen en el GeoJSON como uperm/uproh) — sin el plano de edificación
       no se puede dar altura/CC para un lote que caiga solo en esa zona. Si
       más adelante se consigue el Plano PRLF-1, se puede sumar como capa
       aparte y cruzar ambos planos igual que Las Condes (uso/edificación).
     - Las "zonas con normas conjuntas" (Art. 29 y 32: AV, ED, ESP, RI, R,
       PEDC-3, y las 5 zonas del Sector Centro Z-*) sí traen su propia norma
       de edificación directamente en la Ordenanza — esas son las que se
       transcriben acá.

   ADVERTENCIA de datos (GeoJSON MINVU/IDE Chile): el polígono de "ESP-1
   Manzana Cívica" viene mal etiquetado con código de zona "ESP-2" (el campo
   nombre_zona sí dice "ESP-1..."). Se corrige por nombre_zona en
   claveLaFlorida(), no por el código "zona" tal cual viene.

   ADVERTENCIA de datos: la zona "ZRM-DT" (Zona Residencial Mixta
   Departamental/Tobalaba) no existe en el Texto Refundido de Sept. 2016 que
   se usó de fuente — debe ser de una modificación posterior no incluida en
   ese documento. No se transcribió su norma; verificar con la Ordenanza
   vigente actualizada o con la DOM de La Florida antes de usar este dato.
   --------------------------------------------------------------------------- */
var PRC_NORMAS_LAFLORIDA = {

  /* ---------- SECTOR CENTRO (Art. 32, numeral 9) ---------- */
  'Z-AA1': {
    nombre:'Zona de Edificación Aislada Alta', familia:'alta',
    tablas:[
      { t:'A', label:'Densificación de vivienda en altura', dens:'Libre', predio:'1.000 m²',
        cc:3.5, cos:0.30, rasante:'70°', pisos:null, metros:null,
        antejardin:'3 m (construcción obligatoria sobre la línea de edificación)',
        dist:'O.G.U.C.', ados:'—', agrup:'Aislado',
        nota:'Altura libre según rasantes. Si el edificio incluye equipamiento en el cuerpo bajo (galerías, oficinas, servicios), el COS del primer piso puede subir a 0,6 (60%) hasta los 15 m de altura; sobre ese nivel la vivienda queda limitada a COS 0,3 (30%).' }
    ],
    notas:['Para equipamiento puro se aplican las condiciones de la letra C) del numeral 9 "Zonas del Sector Centro": predio mínimo 1.000 m² y COS/CC según escala (Mayor 0,70/4,0 · Mediana 0,70/4,0 · Menor 0,70/4,0 · Básica 0,50/2,5).']
  },
  'Z-AA2': {
    nombre:'Zona de Transición a Edificación Aislada Alta', familia:'alta',
    tablas:[
      { t:'A', label:'Densificación con desafectación de bienes nacionales de uso público', dens:'Libre', predio:'1.000 m²',
        cc:3.00, cos:0.40, rasante:'70°', pisos:null, metros:null,
        antejardin:'5 m (construcción obligatoria sobre la línea de edificación)',
        dist:'O.G.U.C.', ados:'—', agrup:'Aislado',
        nota:'Solo para proyectos que requieran una superficie superior a una manzana y accedan a desafectar bienes nacionales de uso público (calles/áreas verdes), reponiéndolos dentro del mismo proyecto. Altura libre según rasantes. Equipamiento en los primeros 15 m puede subir el COS del primer piso a 0,6.' },
      { t:'B', label:'Densificación general (sin desafectación)', dens:'Libre', predio:'1.000 m²',
        cc:2.40, cos:0.40, rasante:'70°', pisos:null, metros:null,
        antejardin:'5 m (construcción obligatoria sobre la línea de edificación)',
        dist:'O.G.U.C.', ados:'—', agrup:'Aislado',
        nota:'Altura libre según rasante y distanciamiento. Equipamiento en el diseño puede subir el COS del primer piso a 0,6 hasta 15 m; sobre ese nivel la vivienda queda limitada a COS 0,4 (40%).' },
      { t:'C', label:'Ampliación de vivienda existente', dens:'Libre', predio:'—',
        cc:1.40, cos:0.70, rasante:'70°', pisos:2, metros:7,
        antejardin:'3 m', dist:'O.G.U.C.', ados:'—', agrup:'Aislado, pareado y continuo' }
    ],
    notas:['Las condiciones específicas de equipamiento están en la letra C del numeral 9 "Zonas del Sector Centro" de la Ordenanza.']
  },
  'Z-AA+CB/CM': {
    nombre:'Zona de Edificación Aislada Alta con Continuidad Baja y Media', familia:'alta',
    tablas:[
      { t:'A', label:'Frente a Av. Vicuña Mackenna (tramos específicos)', dens:'Libre', predio:'1.000 m²',
        cc:3.00, cos:'0,60 hasta 7 m y 0,40 sobre esta altura', rasante:'70° (edificación aislada, aplicada sobre la continua)',
        pisos:null, metros:null, antejardin:'No se contempla (construcción obligatoria sobre línea oficial)',
        dist:'O.G.U.C.', ados:'—', agrup:'Continuo hasta 2 pisos (7 m) y aislado sobre esta altura',
        nota:'Aplica a predios con frente principal en Av. Vicuña Mackenna Pte./Ote. entre Mirador Azul y calle Cabildo, y entre Serafín Zamora y Av. Américo Vespucio. El cuerpo continuo debe emplazarse en la línea de edificación y ocupar entre 20% y 40% del deslinde (hasta 40% con autorización notarial del vecino); no puede ser solo fachada ni destinarse a estacionamientos. En el tramo Vicuña Mackenna Oriente entre Barcelona y Cabildo, el COS hasta 7 m sube a 0,8.' },
      { t:'B', label:'Densificación general (fuera de esos tramos)', dens:'Libre', predio:'1.000 m²',
        cc:3.20, cos:0.40, rasante:'70°',
        pisos:null, metros:null, antejardin:'5 m (sin exigencia en predios que enfrentan Av. Vicuña Mackenna Pte./Ote. entre Departamental y Mirador Azul, construcción obligatoria sobre línea oficial)',
        dist:'O.G.U.C.', ados:'—', agrup:'Aislado',
        nota:'Altura mínima 7 m; máxima libre según rasantes y distanciamientos.' },
      { t:'C', label:'Ampliación de vivienda existente', dens:'Libre', predio:'—',
        cc:1.40, cos:0.70, rasante:'70°', pisos:null, metros:7.5,
        antejardin:'3 m', dist:'O.G.U.C.', ados:'—', agrup:'Aislado, pareado y continuo' }
    ],
    notas:['Las condiciones específicas de equipamiento están en la letra C del numeral 9 "Zonas del Sector Centro" de la Ordenanza.']
  },
  'Z-AA+CM': {
    nombre:'Zona de Edificación Aislada Alta con Continuidad Media', familia:'alta',
    tablas:[
      { t:'A', label:'Base', dens:'Libre', predio:'1.500 m²',
        cc:4.00, cos:'0,70 hasta 24 m y 0,35 sobre esta altura', rasante:'70° sobre 24 m',
        pisos:null, metros:null, antejardin:'5 m', dist:'6 m', ados:'—',
        agrup:'Continuo y aislado',
        nota:'Cuerpo continuo con altura mínima de 9 m y máxima de 24 m; sobre este, cuerpo aislado con altura libre según rasantes. La edificación continua se aplica en una franja de 15 m de ancho desde la línea de edificación en todo el perímetro que enfrenta ejes viales (excepto Serafín Zamora entre Vicuña Mackenna Oriente y Américo Vespucio). El tramo de Vicuña Mackenna Oriente entre Plaza Vespucio y Serafín Zamora exige antejardín obligatorio de 15 m.' }
    ],
    notas:[
      'No se permite el emplazamiento de estacionamientos en superficie.',
      'El área libre debe disponerse en el nivel natural del terreno.',
      'La carga y descarga de insumos o mercaderías debe realizarse en espacio privado.',
      'El cuerpo continuo no puede destinarse a vivienda.',
      'Las condiciones específicas de equipamiento están en la letra C del numeral 9 "Zonas del Sector Centro" de la Ordenanza.'
    ]
  },
  'Z-AM': {
    nombre:'Zona de Edificación Aislada de Altura Media', familia:'media',
    tablas:[
      { t:'A', label:'Predios frente a Av. Vespucio, Lía Aguirre, Walker Martínez, Colombia y costado oriente de Punta Arenas', dens:'Libre', predio:'1.000 m²',
        cc:2.00, cos:0.40, rasante:'70°', pisos:null, metros:null,
        antejardin:'5 m (construcción obligatoria sobre la línea de edificación)', dist:'6 m',
        ados:'—', agrup:'Aislado',
        nota:'Altura libre según rasantes. No aplica a los predios colindantes al Santuario de Schöenstatt (entre Walker Martínez, Colombia, Vicente Valdés y La Concepción), que se rigen por el Área de Edificación E-AM2.' },
      { t:'B', label:'Predios frente a Av. Vicuña Mackenna Poniente entre Punta Arenas y San Antonio', dens:'Libre', predio:'1.000 m²',
        cc:3.00, cos:'0,60 hasta 7 m y 0,40 sobre esta altura', rasante:'70° (edificación aislada, aplicada sobre la continua)',
        pisos:null, metros:null, antejardin:'No se aplica (construcción obligatoria sobre línea oficial)',
        dist:'O.G.U.C.', ados:'—', agrup:'Continuo hasta 2 pisos (7 m) y aislado sobre esta altura',
        nota:'Entre calle Punta Arenas y Mirador Azul el sistema de agrupamiento obligatorio es Aislado (sin cuerpo continuo).' },
      { t:'C', label:'Densificación de altura media', dens:'Libre', predio:'1.000 m²',
        cc:1.50, cos:0.40, rasante:'70°', pisos:8, metros:24,
        antejardin:'5 m (construcción obligatoria sobre la línea de edificación)', dist:'4 m',
        ados:'—', agrup:'Aislado' },
      { t:'D', label:'Ampliación de vivienda existente', dens:'Libre', predio:'—',
        cc:1.40, cos:0.70, rasante:'70°', pisos:2, metros:7,
        antejardin:'3 m', dist:'O.G.U.C.', ados:'—', agrup:'Aislado, pareado y continuo' }
    ],
    notas:['Las condiciones específicas de equipamiento están en la letra C del numeral 9 "Zonas del Sector Centro" de la Ordenanza.']
  },

  /* ---------- ÁREAS VERDES (Art. 32, numeral 1) ---------- */
  'AV1.1': {
    nombre:'Parque Isabel Riquelme', familia:'verde',
    tablas:[{ t:'A', label:'Base', dens:'—', predio:'—', cc:0.05, cos:0.05,
      rasante:'O.G.U.C.', pisos:null, metros:null, antejardin:'—', dist:'—', ados:'—', agrup:'—',
      nota:'COS y CC máximos de 5% y 0,05 respectivamente. Estacionamientos según Art. 7.1.2 del PRMS.' }],
    notas:['Se rige por el Art. 5.2.3.1 del PRMS.']
  },
  'AV1.2': {
    nombre:'Parque El Panul', familia:'verde',
    tablas:[{ t:'A', label:'Base', dens:'—', predio:'—', cc:0.05, cos:'Según OGUC',
      rasante:'O.G.U.C.', pisos:null, metros:null, antejardin:'—', dist:'—', ados:'—', agrup:'—',
      nota:'CC máximo 0,05. Estacionamientos según Art. 7.1.2 del PRMS.' }],
    notas:['Se rige por el Art. 5.2.3.1 del PRMS.']
  },
  'AV1.3': {
    nombre:'Parque La Salle', familia:'verde',
    tablas:[{ t:'A', label:'Base', dens:'—', predio:'—', cc:0.05, cos:'Según OGUC',
      rasante:'O.G.U.C.', pisos:null, metros:null, antejardin:'—', dist:'—', ados:'—', agrup:'—',
      nota:'CC máximo 0,05. Estacionamientos según Art. 7.1.2 del PRMS.' }],
    notas:['Se rige por el Art. 5.2.3.1 del PRMS.']
  },
  'AV2': {
    nombre:'Cerros Islas', familia:'verde',
    tablas:[{ t:'A', label:'Base', dens:'—', predio:'—', cc:0.05, cos:0.05,
      rasante:'O.G.U.C.', pisos:null, metros:null, antejardin:'—', dist:'—', ados:'—', agrup:'—',
      nota:'COS y CC máximos de 5% y 0,05. Estacionamientos según Art. 7.1.2 del PRMS.' }],
    notas:['Se rige por el Art. 5.2.3.2 del PRMS.']
  },
  'AV4': {
    nombre:'Avenidas Parque', familia:'verde',
    tablas:[{ t:'A', label:'Base', dens:'—', predio:'—', cc:0.01, cos:0.01,
      rasante:'O.G.U.C.', pisos:null, metros:null, antejardin:'—', dist:'—', ados:'—', agrup:'—',
      nota:'COS y CC máximos de 1%. Estacionamientos según Art. 7.1.2 del PRMS.' }],
    notas:['Se rige por el Art. 5.2.3.4 del PRMS.']
  },

  /* ---------- ZONAS DE RESTRICCIÓN COMBINADAS CON ÁREA VERDE ---------- */
  'R-1/AV3': {
    nombre:'Restricción por Quebradas / Parques Quebradas', familia:'verde',
    tablas:[{ t:'A', label:'Norma de AV3 (referencial)', dens:'—', predio:'—', cc:0.01, cos:0.01,
      rasante:'O.G.U.C.', pisos:null, metros:null, antejardin:'—', dist:'—', ados:'—', agrup:'—' }],
    notas:['Zona de restricción por quebrada (PRMS Art. 8.2.1.1) superpuesta con Parque Quebrada (AV3 del PRC Local). Se rige principalmente por el PRMS — la norma de edificación mostrada es la de AV3 y es solo referencial.']
  },
  'R-2/AV4': {
    nombre:'Restricción por Canales / Avenidas Parque', familia:'verde',
    tablas:[{ t:'A', label:'Norma de AV4 (referencial)', dens:'—', predio:'—', cc:0.01, cos:0.01,
      rasante:'O.G.U.C.', pisos:null, metros:null, antejardin:'—', dist:'—', ados:'—', agrup:'—' }],
    notas:['Zona de restricción por canal (PRMS Art. 8.2.1.1) superpuesta con Avenida Parque (AV4 del PRC Local). Se rige principalmente por el PRMS — la norma de edificación mostrada es la de AV4 y es solo referencial.']
  },
  'R-3/AV5': {
    nombre:'Riesgo por Derrumbe y Asentamiento de Suelo / Área Verde Ex Pozo de Áridos', familia:'verde',
    tablas:[{ t:'A', label:'Norma de AV5 (referencial)', dens:'—', predio:'5 Há', cc:0.02, cos:'Según OGUC',
      rasante:'O.G.U.C.', pisos:null, metros:null, antejardin:'—', dist:'—', ados:'—', agrup:'—' }],
    notas:['Zona de riesgo por derrumbe (PRMS Art. 8.2.1.2) superpuesta con Área Verde Ex Pozo de Áridos (AV5 del PRC Local). Se rige principalmente por el PRMS — la norma de edificación mostrada es la de AV5 y es solo referencial.']
  },
  'R-4': {
    nombre:'Riesgo Geofísico Asociado a Remoción en Masa', familia:'otro',
    tablas:[],
    notas:['Se rige íntegramente por el PRMS (Título 8, Art. 8.2.1.4). La Ordenanza Local de La Florida no fija una norma de edificación propia para esta zona.']
  },
  'R-5/AV6': {
    nombre:'Restricción por Pendiente / Área Verde en Zona de Pendiente', familia:'verde',
    tablas:[{ t:'A', label:'Norma de AV6 (referencial)', dens:'—', predio:'—', cc:0.01, cos:'Según OGUC',
      rasante:'O.G.U.C.', pisos:null, metros:7, antejardin:'—', dist:'—', ados:'—', agrup:'Aislado' }],
    notas:['Zona de restricción por pendiente (PRMS Título 8) superpuesta con Área Verde en Zona de Pendiente (AV6 del PRC Local, se rige por Art. 3.3.2 PRMS). La norma de edificación mostrada es la de AV6 y es solo referencial.']
  },

  /* ---------- EQUIPAMIENTO DEPORTE (Art. 32, numeral 2) ---------- */
  'ED-1': { nombre:'Estadio Entel', familia:'equipamiento',
    tablas:[{ t:'A', label:'Base', dens:'—', predio:'Existente', cc:0.6, cos:0.2, rasante:'O.G.U.C.',
      pisos:null, metros:null, antejardin:'—', dist:'—', ados:'—', agrup:'—' }], notas:['Se rige por el Art. 5.2.4.1 del PRMS.'] },
  'ED-2': { nombre:'Balneario Municipal', familia:'equipamiento',
    tablas:[{ t:'A', label:'Base', dens:'—', predio:'Existente', cc:0.6, cos:0.2, rasante:'O.G.U.C.',
      pisos:null, metros:null, antejardin:'—', dist:'—', ados:'—', agrup:'—' }], notas:['Se rige por el Art. 5.2.4.1 del PRMS.'] },
  'ED-3': { nombre:'Estadio Contraloría General de la República', familia:'equipamiento',
    tablas:[{ t:'A', label:'Base', dens:'—', predio:'Existente', cc:0.6, cos:0.2, rasante:'O.G.U.C.',
      pisos:null, metros:null, antejardin:'—', dist:'—', ados:'—', agrup:'—' }], notas:['Se rige por el Art. 5.2.4.1 del PRMS.'] },
  'ED-4': { nombre:'Estadio Caja de Compensación La Araucana', familia:'equipamiento',
    tablas:[{ t:'A', label:'Base', dens:'—', predio:'Existente', cc:0.6, cos:0.2, rasante:'O.G.U.C.',
      pisos:null, metros:null, antejardin:'—', dist:'—', ados:'—', agrup:'—' }], notas:['Se rige por el Art. 5.2.4.1 del PRMS.'] },
  'ED-6': { nombre:'Estadio Municipal de La Florida (Audax Italiano)', familia:'equipamiento',
    tablas:[{ t:'A', label:'Base', dens:'—', predio:'Existente', cc:0.6, cos:0.2, rasante:'O.G.U.C.',
      pisos:null, metros:null, antejardin:'—', dist:'—', ados:'—', agrup:'—' }], notas:['Se rige por el Art. 5.2.4.1 del PRMS.'] },
  'ED-8': { nombre:'Complejo Deportivo Estrella Manuel Rodríguez', familia:'equipamiento',
    tablas:[{ t:'A', label:'Base', dens:'—', predio:'Existente', cc:0.6, cos:0.2, rasante:'O.G.U.C.',
      pisos:null, metros:null, antejardin:'—', dist:'—', ados:'—', agrup:'—' }], notas:['Se rige por el Art. 5.2.4.1 del PRMS.'] },
  'ED-9': { nombre:'Deportivo Bayer', familia:'equipamiento',
    tablas:[{ t:'A', label:'Base', dens:'—', predio:'Existente', cc:0.6, cos:0.2, rasante:'O.G.U.C.',
      pisos:null, metros:null, antejardin:'—', dist:'—', ados:'—', agrup:'—' }], notas:['Se rige por el Art. 5.2.4.1 del PRMS.'] },
  'ED-11': { nombre:'Complejo Deportivo Gabriela Mistral', familia:'equipamiento',
    tablas:[{ t:'A', label:'Base', dens:'—', predio:'Existente', cc:0.6, cos:0.2, rasante:'O.G.U.C.',
      pisos:null, metros:null, antejardin:'—', dist:'—', ados:'—', agrup:'—' }], notas:['Se rige por el Art. 5.2.4.1 del PRMS.'] },

  /* ---------- ZONAS ESPECIALES (Art. 32, numeral 3) ---------- */
  'ESP-1': {
    nombre:'Manzana Cívica', familia:'equipamiento',
    tablas:[{ t:'A', label:'Base', dens:'Libre', predio:'No se exige', cc:'Libre', cos:0.70,
      rasante:'70° aplicada sobre 11 m', pisos:null, metros:null,
      antejardin:'No se contempla', dist:'Según O.G.U.C.', ados:'—', agrup:'Aislado, pareado y continuo',
      nota:'Altura libre según rasante. Los predios destinados a equipamiento pueden aumentar el COS hasta 0,90.' }],
    notas:['Av. Vicuña Mackenna con Cabildo. En el GeoJSON de origen (MINVU) este polígono viene etiquetado erróneamente con el código de zona "ESP-2"; se corrigió acá usando el nombre de la zona.']
  },
  'ESP-2': {
    nombre:'Terrenos Consultorio', familia:'equipamiento',
    tablas:[{ t:'A', label:'Base', dens:'—', predio:'Existente', cc:3.29, cos:0.84,
      rasante:'Según OGUC', pisos:null, metros:null,
      antejardin:'No se contempla', dist:'Según O.G.U.C.', ados:'No se permiten', agrup:'Aislado',
      nota:'Altura libre según rasante. Estacionamientos según Art. 15 de la Ordenanza Local.' }],
    notas:['Av. El Parque con Froilán Roa (terreno del Hospital/Consultorio de La Florida). Usos permitidos: solo Salud; se prohíbe clínica veterinaria, cementerios y crematorio.']
  },
  'ESP-3': {
    nombre:'Terrenos Congregación Salesiana - Lo Cañas', familia:'patrimonial',
    tablas:[{ t:'A', label:'Se rige por el Área de Edificación E-AM3 (Art. 30, N°8)', dens:'185 viv/há máx. · 10 viv/há mín.',
      predio:'700 m²', cc:2.08, cos:'0,52 (0,60 si es vivienda existente)', rasante:'70°',
      pisos:null, metros:14.4, antejardin:'5 m', dist:'Según O.G.U.C.',
      ados:'No se permite, salvo vivienda existente según O.G.U.C.', agrup:'Aislado',
      nota:'Para equipamiento en este predio, la Ordenanza fija altura máxima de 16,8 m, antejardín 4 m, distancia a medianero según OGUC y sin adosamiento (Art. 30, tabla de Área E-AM3).' }],
    notas:['Usos permitidos: solo Culto y Cultura, y Educación. La Ordenanza remite directamente a la norma de edificación del Área E-AM3 en vez de darle una tabla propia.']
  },
  'ESP-4': {
    nombre:'Precordillera', familia:'verde',
    tablas:[{ t:'A', label:'Base', dens:'—', predio:'1 Há', cc:0.014, cos:0.014,
      rasante:'70°', pisos:null, metros:8, antejardin:'8 m', dist:'Según O.G.U.C.',
      ados:'No se permite', agrup:'Aislado',
      nota:'Coeficiente de Suelo Natural mínimo de 0,972 — al menos 97,2% del predio debe mantenerse sin intervenir. Estacionamientos según Art. 15 de la Ordenanza Local.' }],
    notas:[]
  },

  /* ---------- RESGUARDO DE INFRAESTRUCTURA (Art. 32, numeral 4) ---------- */
  'RI': {
    nombre:'Zona de Resguardo de Infraestructura (código genérico)', familia:'equipamiento',
    tablas:[],
    notas:['El código "RI" tal cual (sin sufijo) es ambiguo en este GeoJSON: la Ordenanza solo define RI-1 (Terminales Rodoviarios) y RI-2 (Infraestructura Sanitaria y Energética), cada una con norma propia. Verificar contra el plano cuál de las dos aplica al polígono antes de usar cualquier norma.']
  },
  'RI-1': {
    nombre:'Terminales Rodoviarios de Locomoción Colectiva Urbana', familia:'equipamiento',
    tablas:[],
    notas:[
      'La Ordenanza distingue dos terminales con normas distintas, y este GeoJSON no trae el sufijo que las diferencia — verificar cuál corresponde al polígono antes de estimar cabida:',
      'RI-1.1 Terminal Rodoviario Bellavista (Línea 5 Metro): sobre el nivel de suelo se rige por la norma de la zona Z-AA+CB/CM (ver esa ficha en este mismo panel).',
      'RI-1.2 Sector Av. Departamental – Av. Tobalaba: se rige por la norma del Área de Edificación E-AM3 (predio 700 m², COS 0,52/0,60, CC 2,08, altura 14,4 m, aislado, rasante 70°, antejardín 5 m).'
    ]
  },
  'RI-2': {
    nombre:'Infraestructura Sanitaria y Energética', familia:'equipamiento',
    tablas:[{ t:'A', label:'Base', dens:'—', predio:'Existente', cc:'Máximo 0,3', cos:'Máximo 0,15',
      rasante:'O.G.U.C.', pisos:null, metros:9, antejardin:'Mínimo 8 m', dist:'Mínima 8 m',
      ados:'No', agrup:'Aislado' }],
    notas:['Agua potable, acueductos, líneas de alta tensión y Central Hidroeléctrica La Florida. Se rige por el Título 8, Capítulo 8.4 del PRMS; las instalaciones nuevas deben incluir clasificación de riesgo industrial otorgada por la SESMA.']
  },

  /* ---------- OTRAS ZONAS CON NORMA CONJUNTA ---------- */
  'PEDC-3': {
    nombre:'Zona de Protección Ecológica con Desarrollo Controlado N°3', familia:'verde',
    tablas:[],
    notas:['Se rige por el Título 8, Capítulo 8.3, Art. 8.3.1.2 del PRMS. La Ordenanza Local de La Florida no fija una tabla numérica propia para esta zona.']
  },
  'PL': {
    nombre:'Zona de Plazas', familia:'verde',
    tablas:[],
    notas:['Bien Nacional de Uso Público (Art. 21 de la Ordenanza Local) — plazas. Sin norma de edificación propia; se integra como espacio público.']
  },

  /* ---------- ZONA NO VERIFICADA ---------- */
  'ZRM-DT': {
    nombre:'Zona Residencial Mixta - Departamental/Tobalaba', familia:'otro',
    tablas:[],
    notas:['Esta zona no aparece en el Texto Refundido de la Ordenanza (Septiembre 2016, incl. Mod. N°1-11) usado como fuente — debe corresponder a una modificación posterior no incluida en ese documento. No se transcribió su norma de edificación: verificar directamente con la Ordenanza vigente actualizada o con la DOM de La Florida antes de usar este dato para un terreno en esta zona.']
  },

  /* ---------- ZONAS DE USO DE SUELO SIN PLANO DE EDIFICACIÓN ---------- */
  /* Cubren la mayor parte del territorio residencial/mixto de la comuna.
     Se les da familia propia ("usosolo") en vez de dejarlas caer en "otro",
     para que en el mapa se distingan de una zona genuinamente sin
     clasificar (como ZRM-DT) — acá SÍ sabemos qué es la zona y su uso de
     suelo permitido/prohibido (viene en el GeoJSON), solo falta la norma
     de edificación (altura, CC, etc.) porque el Plano PRLF-1 no está en
     el dataset del Geoportal MINVU que se usó como fuente. */
  'U-VEV1': {
    nombre:'Uso Preferente Vivienda y Equipamiento N°1', familia:'usosolo',
    tablas:[],
    notas:['Sin norma de edificación transcrita: el Plano PRLF-1 (áreas de edificación E-AB1...E-AA2, Art. 26) no está en el GeoJSON cargado, solo el Plano PRLF-2 de usos de suelo. Uso de suelo permitido/prohibido visible más abajo.']
  },
  'U-VEV2': {
    nombre:'Uso Preferente Vivienda y Equipamiento N°2', familia:'usosolo',
    tablas:[],
    notas:['Sin norma de edificación transcrita: el Plano PRLF-1 (áreas de edificación E-AB1...E-AA2, Art. 26) no está en el GeoJSON cargado, solo el Plano PRLF-2 de usos de suelo. Uso de suelo permitido/prohibido visible más abajo.']
  },
  'U-VEV3': {
    nombre:'Zona de Vivienda y Equipamiento Vecinal N°3', familia:'usosolo',
    tablas:[],
    notas:['Sin norma de edificación transcrita: el Plano PRLF-1 (áreas de edificación E-AB1...E-AA2, Art. 26) no está en el GeoJSON cargado, solo el Plano PRLF-2 de usos de suelo. Uso de suelo permitido/prohibido visible más abajo.']
  },
  'U-VEV4': {
    nombre:'Zona de Vivienda y Equipamiento Vecinal N°4', familia:'usosolo',
    tablas:[],
    notas:['Sin norma de edificación transcrita: el Plano PRLF-1 (áreas de edificación E-AB1...E-AA2, Art. 26) no está en el GeoJSON cargado, solo el Plano PRLF-2 de usos de suelo. Uso de suelo permitido/prohibido visible más abajo.']
  },
  'U-EC1': {
    nombre:'Zona de Equipamiento Comunal N°1', familia:'usosolo',
    tablas:[],
    notas:['Sin norma de edificación transcrita: el Plano PRLF-1 (áreas de edificación E-AB1...E-AA2, Art. 26) no está en el GeoJSON cargado, solo el Plano PRLF-2 de usos de suelo. Uso de suelo permitido/prohibido visible más abajo.']
  },
  'U-EC3': {
    nombre:'Zona de Equipamiento Comunal N°3', familia:'usosolo',
    tablas:[],
    notas:['Sin norma de edificación transcrita: el Plano PRLF-1 (áreas de edificación E-AB1...E-AA2, Art. 26) no está en el GeoJSON cargado, solo el Plano PRLF-2 de usos de suelo. Uso de suelo permitido/prohibido visible más abajo.']
  },
  'U-EC4': {
    nombre:'Zona de Equipamiento Comunal N°4', familia:'usosolo',
    tablas:[],
    notas:['Sin norma de edificación transcrita: el Plano PRLF-1 (áreas de edificación E-AB1...E-AA2, Art. 26) no está en el GeoJSON cargado, solo el Plano PRLF-2 de usos de suelo. Uso de suelo permitido/prohibido visible más abajo.']
  }
};

/* Corrige el error de etiquetado del dato de origen (ESP-1 viene marcado
   como "ESP-2" en el campo "zona"; se distingue por nombre_zona) y entrega
   la clave correcta para buscar en PRC_NORMAS_LAFLORIDA. */
function claveLaFlorida(p){
  var z = (p && p.zona || '').toString();
  if(z === 'ESP-2' && /^ESP-1/.test(p.nombre_zona || '')) return 'ESP-1';
  return z;
}

/* ---------------------------------------------------------------------------
   ÑUÑOA — NORMAS URBANÍSTICAS POR ZONA
   ---------------------------------------------------------------------------
   Fuente: Ordenanza PRC de Ñuñoa, Texto Refundido por Asesoría Urbana
   (actualizado abril 2025), incluye lo dispuesto en el Fallo de la Corte de
   Apelaciones de Santiago (D.O. 26-11-2024) y la Enmienda N°1 (vigente desde
   17-12-2024). Artículo 26 (normas de edificación y subdivisión por zona) y
   Artículo 25 (usos de suelo).

   ADVERTENCIA IMPORTANTE DE DATOS — la geometría del Geoportal MINVU/IDE
   Chile para Ñuñoa usa varios códigos de zona ANTERIORES a la Modificación
   N°18 (2019), que renombró o eliminó varias subzonas. La Ordenanza vigente
   (texto refundido abril 2025) ya no las nombra así. Mapeo verificado contra
   las notas al pie del propio texto refundido (Mod. 18, D.A. N°1.167 de
   23-08-2019):

     Código en el GeoJSON   →  Zona vigente equivalente
     Z-2A, Z-2B              →  eliminadas, fusionadas en Z-2 (nota al pie 109)
     Z-3B                    →  renombrada Z-3A (notas al pie 113-114)
     Z-7A                    →  renombrada Z-5A (nota al pie 167)
     Z-7B                    →  renombrada Z-5B (nota al pie 169)
     Z-8A                    →  renombrada Z-6 (nota al pie 171)
     Z-7 (zona genérica)     →  eliminada en 2019 (nota al pie 83); no está
                                claro en qué zona quedó — usar con cautela

   Se dejaron estos códigos antiguos como entradas propias en la tabla (en
   vez de forzarlos silenciosamente a la zona nueva), cada uno con una nota
   explicando la equivalencia, para que quede visible en el panel y Felipe
   pueda decidir si confía en el mapeo o pide la geometría actualizada.

   Los códigos AV, CD, EI y EN no tienen tabla propia en el Art. 26 (son
   equipamiento/áreas verdes con norma en el PRMS o normas por declaratoria
   patrimonial — ver notas de cada uno).
   --------------------------------------------------------------------------- */
var PRC_NORMAS_NUNOA = {
  'Z-1': {
    nombre:'Zona Z-1', familia:'alta',
    tablas:[
      { t:'A', label:'Base', dens:'—', predio:'500 m²', cc:4, cos:0.6,
        rasante:'70°', pisos:15, metros:44, antejardin:'7 m', dist:'5 m (aislada sobre continua) · Art. 2.6.3 OGUC hasta 3p/9m · 5 m desde 4p/12m',
        ados:'—', agrup:'Continuo, Aislado',
        nota:'Altura continua 17,50 m / 6 pisos; aislada sobre continua sube hasta 25,50 m / 9 pisos y hasta el total de 44 m / 15 pisos con retranqueo de 10 m sobre la línea oficial. COS 0,6 en el continuo y 0,4 en los pisos superiores. Cuerpos salientes sobre antejardín: 1,5 m.' }
    ],
    notas:[]
  },
  'Z-1A': {
    nombre:'Zona Z-1A', familia:'alta',
    tablas:[
      { t:'A', label:'Base', dens:'1.800 hab/ha', predio:'500 m²', cc:3.6, cos:0.6,
        rasante:'70°', pisos:15, metros:44, antejardin:'7 m', dist:'5 m (aislada sobre continua) · Art. 2.6.3 OGUC hasta 3p/9m · 5 m desde 4p/12m',
        ados:'—', agrup:'Continuo y aislado sobre continuo',
        nota:'Altura continua 2 pisos / 7 m; aislada sobre continua hasta 13 pisos / 37 m, total 15 pisos / 44 m, con retranqueo de 10 m. COS 0,6 en el continuo y 0,4 en pisos superiores.' }
    ],
    notas:[]
  },
  'Z-1B': {
    nombre:'Zona Z-1B', familia:'media',
    tablas:[
      { t:'A', label:'Base', dens:'1.600 hab/ha', predio:'500 m²', cc:3.2, cos:0.6,
        rasante:'70°', pisos:10, metros:30, antejardin:'7 m', dist:'5 m (aislada sobre continua) · Art. 2.6.3 OGUC hasta 3p/9m · 5 m desde 4p/12m',
        ados:'—', agrup:'Continuo y aislado sobre continuo',
        nota:'Altura continua 2 pisos / 7 m; aislada sobre continua hasta 8 pisos / 23 m, total 10 pisos / 30 m, con retranqueo de 10 m. COS 0,6 en el continuo y 0,4 en pisos superiores.' }
    ],
    notas:[]
  },
  'Z-1C': {
    nombre:'Zona Z-1C', familia:'alta',
    tablas:[
      { t:'A', label:'Uso Equipamiento — predio ≤ 700 m²', dens:'—', predio:'≤ 700 m²', cc:2.5, cos:0.7,
        rasante:'70° (sobre altura de continuidad) · 60° (desde límite de zona a nivel de terreno)',
        pisos:null, metros:7, antejardin:'No aplica', dist:'4 m (aislada sobre placa)',
        ados:'40% (continuación de placa), no aplica al deslinde norte (Zona Típica)', agrup:'Continua, Aislada',
        nota:'Placa continua/aislada sobre terreno hasta 7 m; sobre la placa se permite un cuerpo aislado adicional de hasta 10,5 m. Profundidad máx. de la placa continua: 50% desde deslindes laterales opuestos. Ochavo 4 m.' },
      { t:'B', label:'Uso Equipamiento — predio > 700 m²', dens:'—', predio:'> 700 m²', cc:2, cos:0.5,
        rasante:'70° (sobre altura de continuidad) · 60° (desde límite de zona a nivel de terreno)',
        pisos:null, metros:7, antejardin:'No aplica', dist:'4 m (aislada sobre placa)',
        ados:'40% (continuación de placa), no aplica al deslinde norte (Zona Típica)', agrup:'Continua, Aislada',
        nota:'Mismas condiciones de altura/agrupamiento que la Tabla A, con CC y COS más bajos por ser predio mayor.' },
      { t:'C', label:'Uso Residencial — predio ≤ 700 m²', dens:'1.200 hab/ha', predio:'≤ 700 m²', cc:2.5, cos:0.6,
        rasante:'70° (sobre altura de continuidad) · 60° (desde límite de zona a nivel de terreno)',
        pisos:null, metros:7, antejardin:'No aplica', dist:'4 m (aislada sobre placa)',
        ados:'40% (continuación de placa), no aplica al deslinde norte (Zona Típica)', agrup:'Continua, Aislada',
        nota:'Altura de continuidad 7 m; las demás normas (retiro sobre placa, ochavo, subterráneo) son las mismas que para Equipamiento en esta zona.' },
      { t:'D', label:'Uso Residencial — predio > 700 m²', dens:'1.200 hab/ha', predio:'> 700 m²', cc:2, cos:0.5,
        rasante:'70° (sobre altura de continuidad) · 60° (desde límite de zona a nivel de terreno)',
        pisos:null, metros:7, antejardin:'No aplica', dist:'4 m (aislada sobre placa)',
        ados:'40% (continuación de placa), no aplica al deslinde norte (Zona Típica)', agrup:'Continua, Aislada' }
    ],
    notas:[
      'Zona pequeña junto a Av. Irarrázaval, colindante con Zona Típica al norte — trato especial de retornos en calles perpendiculares a Irarrázaval (placa de 7 m, distanciamiento 3,50 m al límite norte).',
      'Adosamiento de subterráneo al deslinde lateral desde la L.O.: 80%, con ocupación de suelo en subterráneo también de 80%.'
    ]
  },
  'Z-1D': {
    nombre:'Zona Z-1D', familia:'media',
    tablas:[
      { t:'A', label:'Base', dens:'1.400 hab/ha', predio:'500 m²', cc:2.4, cos:0.6,
        rasante:'70°', pisos:7, metros:21, antejardin:'7 m', dist:'5 m (aislada sobre continua) · Art. 2.6.3 OGUC hasta 3p/9m · 5 m desde 4p/12m',
        ados:'—', agrup:'Continuo y aislado sobre continuo',
        nota:'Altura continua 2 pisos / 7 m; aislada sobre continua hasta 5 pisos / 14 m, total 7 pisos / 21 m, con retranqueo de 10 m. COS 0,6 en el continuo y 0,4 en pisos superiores.' }
    ],
    notas:[]
  },
  'Z-2': {
    nombre:'Zona Z-2', familia:'alta',
    tablas:[
      { t:'A', label:'Base', dens:'1.600 hab/ha', predio:'500 m²', cc:2, cos:0.5,
        rasante:'60°', pisos:10, metros:28, antejardin:'7 m', dist:'5 m (4p/12m+) · Art. 2.6.3 OGUC (hasta 3p/9m)',
        ados:'Según OGUC', agrup:'Aislado, pareado',
        nota:'Cuerpos salientes sobre antejardín: 1,5 m. Conjuntos habitacionales >3 pisos deben destinar 30% del terreno a Área Libre de Esparcimiento (hasta 30% techado). Subsuelo: distanciamiento mínimo 2,5 m al deslinde salvo rampas; sin uso de subsuelo en antejardín de 5 m; ocupación de subsuelo máx. 70% del terreno.' }
    ],
    notas:['El GeoJSON del Geoportal MINVU trae además Z-2A y Z-2B como códigos separados; según la Modificación N°18 (2019) esas subzonas fueron eliminadas y se rigen actualmente por esta norma de Z-2 — ver entradas separadas Z-2A / Z-2B con la advertencia correspondiente.']
  },
  'Z-3': {
    nombre:'Zona Z-3', familia:'media',
    tablas:[
      { t:'A', label:'Base', dens:'1.300 hab/ha', predio:'300 m²', cc:1.8, cos:0.5,
        rasante:'60°', pisos:8, metros:23, antejardin:'7 m', dist:'5 m (4p/12m) · Art. 2.6.3 OGUC (hasta 3p/9m)',
        ados:'Según OGUC', agrup:'Aislado, Pareado',
        nota:'Cuerpos salientes sobre antejardín: 1,5 m.' }
    ],
    notas:[]
  },
  'Z-3A': {
    nombre:'Zona Z-3A', familia:'media',
    tablas:[
      { t:'A', label:'Base', dens:'1.100 hab/ha', predio:'300 m²', cc:1.5, cos:0.4,
        rasante:'60°', pisos:5, metros:14, antejardin:'7 m', dist:'5 m (4p/12m+) · Art. 2.6.3 OGUC (hasta 3p/9m)',
        ados:'Según OGUC, retirado 3 m de la línea de edificación', agrup:'Aislado, Pareado',
        nota:'% máx. de pareo en el deslinde bajo altura de 7 m: 50%. Cuerpos salientes: 1,5 m.' },
      { t:'B', label:'Terreno ≥ 2.000 m²', dens:'1.100 hab/ha', predio:'300 m²', cc:1.8, cos:0.5,
        rasante:'60°', pisos:7, metros:20, antejardin:'7 m', dist:'5 m (4p/12m+) · Art. 2.6.3 OGUC (hasta 3p/9m)',
        ados:'Según OGUC, retirado 3 m de la línea de edificación', agrup:'Aislado, Pareado' }
    ],
    notas:['Antes de la Modificación N°18 (2019) esta zona se llamaba "Z-3B"; el GeoJSON del Geoportal MINVU puede traer ese código antiguo — ver entrada separada Z-3B.']
  },
  'Z-4': {
    nombre:'Zona Z-4', familia:'baja',
    tablas:[
      { t:'A', label:'Base', dens:'850 hab/ha', predio:'300 m²', cc:1.5, cos:0.4,
        rasante:'60°', pisos:5, metros:14, antejardin:'5 m (1 a 3 pisos) · Según Art. 11 (4+ pisos)',
        dist:'5 m (4p+) · Art. 2.6.3 OGUC (hasta 3p/9m)', ados:'Según OGUC, retirado 3 m de la línea de edificación',
        agrup:'Aislado',
        nota:'Altura máxima 14 m medidos desde el nivel de solera (5 pisos máx.). En predios existentes menores a la subdivisión mínima, el COS puede subir hasta 60%.' }
    ],
    notas:[]
  },
  'Z-4m': {
    nombre:'Zona Z-4m (modificado)', familia:'baja',
    tablas:[
      { t:'A', label:'Uso Residencial — base', dens:'850 hab/ha', predio:'300 m²', cc:1, cos:0.4,
        rasante:'60°', pisos:3, metros:8, antejardin:'5 m (1 a 3 pisos) · Según Art. 11 (4+ pisos)',
        dist:'5 m (4p+)', ados:'Según OGUC, retirado 3 m de la línea de edificación', agrup:'Aislado, Pareado',
        nota:'COS máx. sube a 0,6 en predios ≤ 300 m². % máx. de pareo en deslinde con altura de 6 m: 40%.' },
      { t:'B', label:'Uso Residencial — terreno ≥ 1.000 m²', dens:'850 hab/ha', predio:'300 m²', cc:1.5, cos:0.4,
        rasante:'60°', pisos:5, metros:14, antejardin:'5 m (1 a 3 pisos) · Según Art. 11 (4+ pisos)',
        dist:'5 m (4p+)', ados:'Según OGUC, retirado 3 m de la línea de edificación', agrup:'Aislado, Pareado' },
      { t:'C', label:'Uso Equipamiento', dens:'—', predio:'500 m²', cc:1.5, cos:0.4,
        rasante:'60°', pisos:4, metros:null, antejardin:'5 m (1 a 3 pisos) · Según Art. 11 (4 pisos)',
        dist:'4 m (4+ pisos)', ados:'—', agrup:'Aislado' }
    ],
    notas:[]
  },
  'Z-4A': {
    nombre:'Zona Z-4A', familia:'baja',
    tablas:[
      { t:'A', label:'Uso Residencial', dens:'850 hab/ha', predio:'300 m²', cc:2, cos:0.5,
        rasante:'60°', pisos:null, metros:17.5, antejardin:'5 m (1 a 3 pisos) · Según Art. 11 (4+ pisos)',
        dist:'5 m (4p+)', ados:'Según OGUC, retirado 3 m de la línea de edificación', agrup:'Aislado',
        nota:'Altura máxima 17,50 m medidos desde el nivel de solera. El resto de las condiciones de subdivisión y edificación son las de la Zona Z-4 residencial.' }
    ],
    notas:[]
  },
  'Z-4B': {
    nombre:'Zona Z-4B', familia:'media',
    tablas:[
      { t:'A', label:'Uso Residencial — < 1.000 m²', dens:'1.300 hab/ha', predio:'300 m²', cc:1.8, cos:0.4,
        rasante:'60°', pisos:3, metros:9, antejardin:'5 m (1 a 3 pisos) · Según Art. 11 (4+ pisos)',
        dist:'4 m', ados:'Según OGUC, retirado 3 m de la línea de edificación', agrup:'Aislado',
        nota:'% máx. de pareo en deslinde con altura de 6 m: 40%. Conjuntos PPH: 35% del terreno como Área Libre de Esparcimiento (hasta 30% techado).' },
      { t:'B', label:'Uso Residencial — 1.000 a 2.000 m²', dens:'1.300 hab/ha', predio:'300 m²', cc:1.8, cos:0.4,
        rasante:'60°', pisos:5, metros:14, antejardin:'5 m (1 a 3 pisos) · Según Art. 11 (4+ pisos)',
        dist:'5 m', ados:'Según OGUC, retirado 3 m de la línea de edificación', agrup:'Aislado' },
      { t:'C', label:'Uso Residencial — sobre 2.000 m²', dens:'1.300 hab/ha', predio:'300 m²', cc:1.8, cos:0.4,
        rasante:'60°', pisos:8, metros:22, antejardin:'5 m (1 a 3 pisos) · Según Art. 11 (4+ pisos)',
        dist:'Incremento de 1 m por cada piso sobre el 2°', ados:'Según OGUC, retirado 3 m de la línea de edificación', agrup:'Aislado' },
      { t:'D', label:'Uso Equipamiento', dens:'—', predio:'500 m²', cc:1.5, cos:0.4,
        rasante:'60°', pisos:4, metros:null, antejardin:'5 m (1 a 3 pisos) · Según Art. 11 (4 pisos)',
        dist:'4 m (4+ pisos)', ados:'—', agrup:'Aislado' }
    ],
    notas:['Subsuelo: distanciamiento mínimo 2,5 m al deslinde salvo rampas; sin uso de subsuelo en antejardín de 5 m; ocupación de subsuelo máx. 70% del terreno.']
  },
  'Z-4C': {
    nombre:'Zona Z-4C', familia:'baja',
    tablas:[
      { t:'A', label:'Uso Residencial', dens:'800 hab/ha', predio:'300 m²', cc:1.5, cos:0.4,
        rasante:'60°', pisos:5, metros:14, antejardin:'5 m (1 a 3 pisos) · Según Art. 11 (4+ pisos)',
        dist:'5 m (4p+) · Art. 2.6.3 OGUC (hasta 3p/9m)', ados:'Según OGUC, retirado 3 m de la línea de edificación',
        agrup:'Aislado',
        nota:'Cuerpos salientes máx. 1 m (en vez de 1,5 m). El resto de las condiciones son las mismas que la Zona Z-4.' }
    ],
    notas:['Subzonas Z-4C+R y Z-4C+RB: misma norma de edificación de Z-4C; "+R" agrega el uso "restaurantes" y "+RB" agrega "restaurantes" y "bares" al uso de suelo Comercio, que en Z-4C base están prohibidos.']
  },
  'Z-5': {
    nombre:'Zona Z-5', familia:'baja',
    tablas:[
      { t:'A', label:'Base', dens:'500 hab/ha', predio:'300 m²', cc:1.5, cos:0.6,
        rasante:'Según Art. 2.6.3 OGUC', pisos:3, metros:8, antejardin:'5 m',
        dist:'Art. 2.6.3 OGUC (hasta 3p/9m)', ados:'Según OGUC', agrup:'Aislado, Pareado',
        nota:'Altura máx. de cierro en deslindes colindantes a Inmuebles de Conservación Histórica: 2,40 m con 70% de transparencia.' }
    ],
    notas:[]
  },
  'Z-5A': {
    nombre:'Zona Z-5A', familia:'baja',
    tablas:[
      { t:'A', label:'Uso Residencial — terreno > 300 m²', dens:'500 hab/ha', predio:'300 m²', cc:1.5, cos:0.5,
        rasante:'60°', pisos:3, metros:9, antejardin:'5 m', dist:'Según Art. 2.6.3 OGUC',
        ados:'Según Art. 2.6.2 OGUC', agrup:'Aislado, Pareado',
        nota:'COS sube a 0,6 en terrenos ≤ 300 m². % máx. de pareo en deslinde con altura de 6 m: 40%. Cuerpos salientes máx. 1 m.' },
      { t:'B', label:'Uso Equipamiento', dens:'—', predio:'500 m²', cc:1.5, cos:0.4,
        rasante:'60°', pisos:3, metros:9, antejardin:'5 m', dist:'Según Art. 2.6.3 OGUC',
        ados:'Según Art. 2.6.2 OGUC', agrup:'Aislado',
        nota:'% máx. de pareo en deslinde con altura de 6 m: 40%. Cuerpos salientes máx. 1 m.' }
    ],
    notas:['Espacios en subsuelo (Residencial y Equipamiento) deben cumplir el Art. 8° de la Ordenanza Local. Zona conocida como "Z-7A" antes de la Modificación N°18 (2019) — ver entrada separada Z-7A.']
  },
  'Z-5B': {
    nombre:'Zona Z-5B', familia:'baja',
    tablas:[
      { t:'A', label:'Uso Residencial', dens:'1.000 hab/ha', predio:'300 m²', cc:1.5, cos:0.6,
        rasante:'60°', pisos:3, metros:9, antejardin:'5 m', dist:'Según Art. 2.6.3 OGUC',
        ados:'Según Art. 2.6.2 OGUC', agrup:'Aislado, Pareado',
        nota:'% máx. de pareo en el deslinde: 40%. Cuerpos salientes máx. 1 m.' },
      { t:'B', label:'Uso Equipamiento', dens:'—', predio:'500 m²', cc:1.5, cos:0.5,
        rasante:'60°', pisos:3, metros:9, antejardin:'5 m', dist:'Según Art. 2.6.3 OGUC',
        ados:'Según Art. 2.6.2 OGUC', agrup:'Aislado',
        nota:'% máx. de pareo en el deslinde: 40%. Cuerpos salientes máx. 1 m.' }
    ],
    notas:['Espacios en subsuelo (Residencial y Equipamiento) deben cumplir el Art. 8° de la Ordenanza Local. Zona conocida como "Z-7B" antes de la Modificación N°18 (2019) — ver entrada separada Z-7B.']
  },
  'Z-6': {
    nombre:'Zona Z-6 · Equipamiento Deportivo Recreativo Exclusivo', familia:'equipamiento',
    tablas:[
      { t:'A', label:'Base', dens:'—', predio:'6.500 m²', cc:1, cos:0.2,
        rasante:'60°', pisos:3, metros:9, antejardin:'5 m (1 a 3 pisos) · 7 m (4 pisos y altura 12 m o más)',
        dist:'—', ados:'—', agrup:'Aislado',
        nota:'Deslindes con zona residencial: franja de 10 m arborizada.' }
    ],
    notas:['Zona conocida como "Z-8A" antes de la Modificación N°18 (2019) — ver entrada separada Z-8A.']
  },
  'ZI-1': {
    nombre:'Zona ZI-1', familia:'equipamiento',
    tablas:[
      { t:'A', label:'Base', dens:'—', predio:'5.000 m²', cc:1.5, cos:0.6,
        rasante:'60° (aplicada sobre nivel de suelo)', pisos:5, metros:15, antejardin:'7 m',
        dist:'5 m', ados:'—', agrup:'Aislado' }
    ],
    notas:['Zona industrial inofensiva — Art. 25 permite todas las actividades productivas y equipamiento, salvo esparcimiento tipo parque zoológico/casinos, salud (cementerios/crematorios) y varios rubros de comercio de gran escala (mall, megamercados, mercados, discotecas, etc.).']
  },
  'ZR-1': {
    nombre:'Zona ZR-1 · Restricción ferroviaria y de canales', familia:'verde',
    tablas:[],
    notas:[
      'Comprende la restricción ferroviaria de la ex-Estación Ñuñoa (recinto, bodegas, franja de tráfico de 20 m y faja no edificable de 30 m en el lado poniente) — solo se permiten instalaciones propias de la vía férrea (hoy Metro).',
      'Incluye también las fajas de protección de los canales San Carlos y San Miguel: uso de suelo permitido es Área Verde (franja de 15 m desde el eje del Canal San Carlos hacia el interior, más servidumbre de 8 m centrada en su eje; servidumbre de 3 m centrada en el eje del Canal San Miguel). Cualquier obra cercana que pueda desestabilizar el canal requiere aprobación de la Dirección de Obras Hidráulicas del MOP o la SEREMI MOP.'
    ]
  },

  /* ---------- CÓDIGOS ANTERIORES A LA MODIFICACIÓN N°18 (2019) ---------- */
  /* El Geoportal MINVU/IDE Chile aún puede traer estos códigos "viejos".
     Se dejan como entradas propias (en vez de forzarlos a la zona nueva)
     para que la equivalencia quede visible en el panel. */
  'Z-2A': {
    nombre:'Zona Z-2A (código anterior a Mod. N°18, 2019)', familia:'alta',
    tablas:[
      { t:'A', label:'Se rige por la norma vigente de Z-2', dens:'1.600 hab/ha', predio:'500 m²', cc:2, cos:0.5,
        rasante:'60°', pisos:10, metros:28, antejardin:'7 m', dist:'5 m (4p/12m+) · Art. 2.6.3 OGUC (hasta 3p/9m)',
        ados:'Según OGUC', agrup:'Aislado, pareado',
        nota:'Según la Modificación N°18 (2019, D.A. N°1.167) las subzonas Z-2A y Z-2B fueron eliminadas y absorbidas por la Zona Z-2. Se muestra la norma vigente de Z-2 como referencia, pero conviene confirmar el límite exacto del polígono con la DOM antes de usarlo para cabida.' }
    ],
    notas:['Código presente en la geometría del Geoportal MINVU pero ya no existe en el texto refundido de abril 2025 de la Ordenanza.']
  },
  'Z-2B': {
    nombre:'Zona Z-2B (código anterior a Mod. N°18, 2019)', familia:'alta',
    tablas:[
      { t:'A', label:'Se rige por la norma vigente de Z-2', dens:'1.600 hab/ha', predio:'500 m²', cc:2, cos:0.5,
        rasante:'60°', pisos:10, metros:28, antejardin:'7 m', dist:'5 m (4p/12m+) · Art. 2.6.3 OGUC (hasta 3p/9m)',
        ados:'Según OGUC', agrup:'Aislado, pareado',
        nota:'Según la Modificación N°18 (2019, D.A. N°1.167) las subzonas Z-2A y Z-2B fueron eliminadas y absorbidas por la Zona Z-2. Se muestra la norma vigente de Z-2 como referencia, pero conviene confirmar el límite exacto del polígono con la DOM antes de usarlo para cabida.' }
    ],
    notas:['Código presente en la geometría del Geoportal MINVU pero ya no existe en el texto refundido de abril 2025 de la Ordenanza.']
  },
  'Z-3B': {
    nombre:'Zona Z-3B (código anterior a Mod. N°18, 2019 · hoy Z-3A)', familia:'media',
    tablas:[
      { t:'A', label:'Se rige por la norma vigente de Z-3A', dens:'1.100 hab/ha', predio:'300 m²', cc:1.5, cos:0.4,
        rasante:'60°', pisos:5, metros:14, antejardin:'7 m', dist:'5 m (4p/12m+) · Art. 2.6.3 OGUC (hasta 3p/9m)',
        ados:'Según OGUC, retirado 3 m de la línea de edificación', agrup:'Aislado, Pareado',
        nota:'La Modificación N°18 (2019, D.A. N°1.167) renombró la antigua "Zona Z-3B" como "Zona Z-3A" (y eliminó la antigua Z-3A). Tabla equivalente a 1.500 m² sube CC a 1,8 y altura a 7 pisos/20 m — ver zona Z-3A en este panel.' }
    ],
    notas:['Código presente en la geometría del Geoportal MINVU pero renombrado en el texto refundido de abril 2025 de la Ordenanza.']
  },
  'Z-7': {
    nombre:'Zona Z-7 (código eliminado en Mod. N°18, 2019 — sin equivalencia clara)', familia:'otro',
    tablas:[],
    notas:[
      'Esta zona "Z-7" (creada por la Modificación N°14 de 2016) fue eliminada por la Modificación N°18 (2019, D.A. N°1.167) según la nota al pie del propio texto refundido, pero la Ordenanza no deja explícito en qué zona quedó absorbida el área.',
      'No se transcribió una norma de reemplazo para evitar dar un dato incorrecto — verificar directamente con la Dirección de Obras Municipales de Ñuñoa el estado actual de estos polígonos antes de usarlos para cualquier cálculo de cabida.'
    ]
  },
  'Z-7A': {
    nombre:'Zona Z-7A (código anterior a Mod. N°18, 2019 · hoy Z-5A)', familia:'baja',
    tablas:[
      { t:'A', label:'Se rige por la norma vigente de Z-5A · Uso Residencial', dens:'500 hab/ha', predio:'300 m²', cc:1.5, cos:0.5,
        rasante:'60°', pisos:3, metros:9, antejardin:'5 m', dist:'Según Art. 2.6.3 OGUC',
        ados:'Según Art. 2.6.2 OGUC', agrup:'Aislado, Pareado',
        nota:'La Modificación N°18 (2019, D.A. N°1.167) renombró "Zona Z-7A" como "Zona Z-5A". Ver esa zona en este panel para la tabla completa (incluye uso Equipamiento).' }
    ],
    notas:['Código presente en la geometría del Geoportal MINVU pero renombrado en el texto refundido de abril 2025 de la Ordenanza.']
  },
  'Z-7B': {
    nombre:'Zona Z-7B (código anterior a Mod. N°18, 2019 · hoy Z-5B)', familia:'baja',
    tablas:[
      { t:'A', label:'Se rige por la norma vigente de Z-5B · Uso Residencial', dens:'1.000 hab/ha', predio:'300 m²', cc:1.5, cos:0.6,
        rasante:'60°', pisos:3, metros:9, antejardin:'5 m', dist:'Según Art. 2.6.3 OGUC',
        ados:'Según Art. 2.6.2 OGUC', agrup:'Aislado, Pareado',
        nota:'La Modificación N°18 (2019, D.A. N°1.167) renombró "Zona Z-7B" como "Zona Z-5B". Ver esa zona en este panel para la tabla completa (incluye uso Equipamiento).' }
    ],
    notas:['Código presente en la geometría del Geoportal MINVU pero renombrado en el texto refundido de abril 2025 de la Ordenanza.']
  },
  'Z-8A': {
    nombre:'Zona Z-8A (código anterior a Mod. N°18, 2019 · hoy Z-6)', familia:'equipamiento',
    tablas:[
      { t:'A', label:'Se rige por la norma vigente de Z-6', dens:'—', predio:'6.500 m²', cc:1, cos:0.2,
        rasante:'60°', pisos:3, metros:9, antejardin:'5 m (1-3 pisos) · 7 m (4 pisos y altura 12 m o más)',
        dist:'—', ados:'—', agrup:'Aislado',
        nota:'La Modificación N°18 (2019, D.A. N°1.167) renombró "Zona Z-8A" como "Zona Z-6" (Equipamiento Deportivo Recreativo Exclusivo). Ver esa zona en este panel.' }
    ],
    notas:['Código presente en la geometría del Geoportal MINVU pero renombrado en el texto refundido de abril 2025 de la Ordenanza.']
  },

  /* ---------- ÁREAS VERDES Y EQUIPAMIENTO SIN TABLA PROPIA EN ART. 26 ---------- */
  'AV': {
    nombre:'Zona de Áreas Verdes', familia:'verde',
    tablas:[],
    notas:['Sin norma de edificación propia en el Art. 26 — uso de suelo exclusivo Área Verde; todos los demás usos quedan prohibidos según el propio GeoJSON (campo "uso prohibido").']
  },
  'CD': {
    nombre:'Zona de Centro Deportivo', familia:'equipamiento',
    tablas:[],
    notas:['Código de equipamiento deportivo existente que no aparece con tabla propia en el Art. 24-26 del texto refundido usado como fuente (abril 2025) — probablemente instalaciones singularizadas de forma puntual. Verificar la norma aplicable directamente con la DOM de Ñuñoa antes de estimar cabida.']
  },
  'EI': {
    nombre:'Zona de Equipamiento Intercomunal', familia:'equipamiento',
    tablas:[],
    notas:['Equipamiento de escala intercomunal (hospitales, grandes establecimientos), normado por el Plan Regulador Metropolitano de Santiago (PRMS) — Título 5, Art. 5.6 — y no por la Ordenanza comunal. No se transcribió tabla; consultar la Ordenanza del PRMS o la DOM de Ñuñoa para el predio específico.']
  },
  'EN': {
    nombre:'Estadio Nacional — Equipamiento Intercomunal PRMS', familia:'patrimonial',
    tablas:[
      { t:'A', label:'Norma como Monumento Histórico (MH1, Art. 31)', dens:'—', predio:'2.500 m²', cc:2.5, cos:0.2,
        rasante:'—', pisos:10, metros:30, antejardin:'15 m', dist:'—', ados:'—', agrup:'Aislada',
        nota:'El Estadio Nacional está declarado Monumento Histórico (Decreto exento N°710 del Ministerio de Educación, 11-09-2003, D.O. 17-10-2003) y se rige por la ficha MH1 del Art. 31 de la Ordenanza, que remite además a todos los usos del Art. 5.2.4.1 del PRMS. Estacionamientos: 1 cada 25 personas.' }
    ],
    notas:['Sitio de uso mixto Área Verde/Equipamiento Recreacional y Deportivo, con hasta 20% de la superficie del predio disponible para otros usos de equipamiento según el detalle del Art. 31.']
  }
};

/* ---------------------------------------------------------------------------
   LO BARNECHEA — normas embebidas en el propio GeoJSON
   ---------------------------------------------------------------------------
   Acá cada polígono trae sus normas como atributos (no hay tabla aparte que
   mantener). Estas funciones solo traducen esos campos a la misma forma
   {nombre, familia, tablas, notas} que usa el resto del panel, para que
   renderZona() no tenga que saber de dónde vino cada dato.
   --------------------------------------------------------------------------- */

// El número en la sigla de zona (ej. "ZHE-6" → 6, "ZHP-4.2" → 4, "ZM-6a" → 6)
// representa la altura EN PISOS que la zona puede alcanzar con incentivo —
// es la clasificación que usa la propia Municipalidad. Se usa solo para
// elegir el color en el mapa, no para las normas mostradas.
function siglaPisosLB(zona){
  if(!zona) return null;
  var partes = zona.split('-');
  if(partes.length < 2) return null;
  var m = /^(\d+)/.exec(partes[1]);
  return m ? parseInt(m[1], 10) : null;
}

function familiaLB(p){
  var z = (p.zona || '').toString();
  if(z.indexOf('AVI') === 0 || z.indexOf('AVN') === 0 || z === 'AVEP' || z === 'ZERH') return 'verde';
  if(z.indexOf('ZIE') === 0 || z.indexOf('ZEE') === 0 || z.indexOf('ZEP') === 0) return 'equipamiento';
  var pisos = siglaPisosLB(z);
  if(pisos === null) return 'otro';
  if(pisos <= 3) return 'baja';
  if(pisos <= 6) return 'media';
  return 'alta';
}

// Deja un valor numérico tal cual (fmtCoef lo formatea después) y uno de
// texto (ej. "OGUC", "2.1.30 OGUC") tal cual también.
function limpioLB(v){
  if(v === null || v === undefined) return null;
  if(typeof v === 'number') return v;
  var s = v.toString().trim();
  return s === '' ? null : s;
}

// Agrega " m" a campos de texto puramente numéricos (antejardín, distanciamiento…)
// y deja intacto cualquier otro texto (ej. "OGUC", "N/A").
function metrosTxtLB(v){
  var s = limpioLB(v);
  if(s === null || typeof s === 'number') return s;
  return /^-?\d+([.,]\d+)?$/.test(s) ? s.replace('.', ',') + ' m' : s;
}

function predioTxtLB(v){
  if(typeof v === 'number') return v.toLocaleString('es-CL') + ' m²';
  return limpioLB(v);
}

function hayIncentivoLB(p){
  return (typeof p.coef_cons_inc === 'number' && p.coef_cons_inc > 0) ||
         (typeof p.alt_inc_pisos === 'number' && p.alt_inc_pisos > 0) ||
         (typeof p.dens_max_inc  === 'number' && p.dens_max_inc  > 0);
}

function tablasLB(p){
  var tablas = [{
    t:'A', label:'Base',
    dens: limpioLB(p.dens_max), predio: predioTxtLB(p.sup_predial_min),
    cc: limpioLB(p.coef_cons), cos: limpioLB(p.coef_ocu),
    rasante: limpioLB(p.rasante),
    pisos: typeof p.alt_max_pisos === 'number' ? p.alt_max_pisos : null,
    metros: limpioLB(p.alt_max_m),
    antejardin: metrosTxtLB(p.antejardin), dist: metrosTxtLB(p.dist),
    ados: limpioLB(p.ados), agrup: limpioLB(p.agrup)
  }];
  if(hayIncentivoLB(p)){
    tablas.push({
      t:'B', label:'Con incentivo',
      dens: limpioLB(p.dens_max_inc), predio: predioTxtLB(p.sup_predial_min),
      cc: limpioLB(p.coef_cons_inc), cos: limpioLB(p.coef_ocu_inc),
      rasante: limpioLB(p.rasante),
      pisos: (typeof p.alt_inc_pisos === 'number' && p.alt_inc_pisos > 0) ? p.alt_inc_pisos : null,
      metros: limpioLB(p.alt_inc_m),
      antejardin: metrosTxtLB(p.antejardin), dist: metrosTxtLB(p.dist),
      ados: limpioLB(p.ados), agrup: limpioLB(p.agrup),
      nota:'Sujeto a cumplir las condiciones de incentivo de densificación de la Ordenanza vigente.'
    });
  }
  return tablas;
}

function normasLB(p){
  return {
    nombre: p.n_subzona || p.nombre || p.zona,
    familia: familiaLB(p),
    tablas: tablasLB(p),
    notas: p.notas ? [p.notas] : []
  };
}


/* ===========================================================================
   2. ESTADO
   =========================================================================== */

var prcDataCache = {};       // { comuna: geojson } — cache por comuna, evita recargar
var prcLayerCache = {};      // { comuna: capa Leaflet } — idem, evita reconstruir

var prcData = null;          // GeoJSON de la comuna ACTIVA (alias sobre prcDataCache)
var prcLayer = null;         // capa Leaflet de la comuna ACTIVA (alias sobre prcLayerCache)
var currentComuna = null;    // comuna actualmente activa en el módulo
var prcVisible = false;      // si la capa está agregada al mapa
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

// Recibe las properties COMPLETAS de un feature (no solo la zona), porque
// algunas comunas necesitan todos los campos de norma, no solo el código.
// Rama según currentComuna. IMPORTANTE: cada comuna con tabla de normas debe
// estar explícita acá — si se cae al "default", comunas sin normas propias
// podrían heredar por accidente códigos que coinciden con los de otra (ej.
// "AV" existe tanto en Las Condes como en Huechuraba y Providencia, con
// normas completamente distintas).
function normasDe(properties){
  if(!properties) return null;
  if(currentComuna === 'Lo Barnechea'){
    return normasLB(properties);
  }
  if(currentComuna === 'Las Condes'){
    return PRC_NORMAS[splitZona(properties.zona).edif] || null;
  }
  if(currentComuna === 'Providencia'){
    return PRC_NORMAS_PROVIDENCIA[splitZona(properties.zona).edif] || null;
  }
  if(currentComuna === 'Vitacura'){
    return PRC_NORMAS_VITACURA[splitZona(properties.zona).edif] || null;
  }
  if(currentComuna === 'La Florida'){
    // Ojo: acá NO se usa splitZona(), porque varios códigos de zona de La
    // Florida traen su propio "/" como parte del código (ej. "R-1/AV3"), no
    // como separador uso/edificación.
    return PRC_NORMAS_LAFLORIDA[claveLaFlorida(properties)] || null;
  }
  if(currentComuna === 'Ñuñoa'){
    // Igual que La Florida: los códigos de Ñuñoa no usan "/" como separador
    // uso/edificación, así que se busca la zona completa tal cual viene.
    return PRC_NORMAS_NUNOA[(properties.zona || '').toString()] || null;
  }
  // Comuna con geometría y usos de suelo cargados, pero normas urbanísticas
  // aún sin transcribir de su Ordenanza. renderZona() ya maneja este caso
  // mostrando "Sin normas cargadas" sin romper nada.
  return null;
}

function familiaDe(properties){
  var n = normasDe(properties);
  return (n && n.familia) ? n.familia : 'otro';
}

function colorDe(properties){
  var f = PRC_FAMILIAS[familiaDe(properties)];
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
function maximosDe(properties){
  var n = normasDe(properties);
  if(!n || !n.tablas.length) return null;
  var maxCC = 0, maxPisos = 0, maxMetros = 0, maxDens = 0;
  n.tablas.forEach(function(tb){
    if(typeof tb.cc === 'number' && tb.cc > maxCC) maxCC = tb.cc;
    if(typeof tb.pisos === 'number' && tb.pisos > maxPisos) maxPisos = tb.pisos;
    if(typeof tb.metros === 'number' && tb.metros > maxMetros) maxMetros = tb.metros;
    var raw = tb.dens;
    var d = typeof raw === 'number' ? raw : parseInt((raw || '').toString().replace(/\./g, ''), 10);
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

// Busca la feature del PRC que contiene el punto. Por defecto busca en la
// comuna activa (prcData); se le puede pasar otro dataset explícito (lo usa
// la ficha del terreno, que consulta SU comuna sin tocar la comuna activa).
function findZonaAt(lat, lng, dataset){
  var data = dataset || prcData;
  if(!data) return null;
  for(var i = 0; i < data.features.length; i++){
    var f = data.features[i];
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

  /* Fila de chips de comuna (solo aparece si hay más de una comuna cargada) */
  #prc-comuna-row {
    display: none; gap: 6px; padding: 8px 14px; border-bottom: 1px solid var(--border);
    background: var(--surface); flex-wrap: wrap; flex-shrink: 0;
  }
  .prc-comuna-chip {
    background: var(--bg); border: 1px solid var(--border); border-radius: 12px;
    padding: 4px 11px; font-family: var(--font-sans); font-size: 11px; color: var(--text-muted);
    cursor: pointer; transition: all 0.2s cubic-bezier(0.4,0,0.2,1);
  }
  .prc-comuna-chip:hover { border-color: var(--pl-deep); color: var(--pl-deep); }
  .prc-comuna-chip.active { background: var(--pl-deep); border-color: var(--pl-deep); color: #fff; }
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
    '<div id="prc-comuna-row"></div>' +
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

  // Delegado: click en cualquier chip de comuna cambia la comuna activa
  document.getElementById('prc-comuna-row').addEventListener('click', function(e){
    var btn = e.target.closest ? e.target.closest('.prc-comuna-chip') : null;
    if(!btn) return;
    var comuna = btn.getAttribute('data-comuna');
    if(comuna) switchComuna(comuna, { show:true, view:'legend' });
  });
}

// Pinta la fila de chips de comuna (oculta si solo hay una comuna cargada)
function renderComunaChips(){
  var row = document.getElementById('prc-comuna-row');
  if(!row) return;
  var keys = Object.keys(PRC_COMUNAS);
  if(keys.length < 2){ row.style.display = 'none'; row.innerHTML = ''; return; }
  row.style.display = 'flex';
  row.innerHTML = keys.map(function(k){
    var active = k === currentComuna;
    return '<button class="prc-comuna-chip' + (active ? ' active' : '') + '" data-comuna="' + esc(k) + '">' + esc(k) + '</button>';
  }).join('');
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

// Carga (y cachea) el GeoJSON de UNA comuna específica. No toca cuál es la
// comuna "activa" del módulo — eso lo decide quien llama, con setActiveComuna().
function loadPRC(comuna, callback){
  if(!PRC_COMUNAS[comuna]){ callback(new Error('Comuna sin PRC: ' + comuna), null); return; }
  if(prcDataCache[comuna]){ callback(null, prcDataCache[comuna]); return; }

  prcLoading = true;
  setBtnState();

  fetch(PRC_COMUNAS[comuna])
    .then(function(r){
      if(!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function(json){
      prcDataCache[comuna] = json;
      prcLoading = false;
      setBtnState();
      callback(null, json);
    })
    .catch(function(err){
      console.error('PRC: error al cargar el GeoJSON de ' + comuna, err);
      prcLoading = false;
      setBtnState();
      callback(err, null);
    });
}


/* ===========================================================================
   7. CAPA EN EL MAPA
   =========================================================================== */

function styleFor(feature){
  var fam = familiaDe(feature.properties);
  var visible = !prcFamiliaFiltro || prcFamiliaFiltro === fam;
  return {
    color: colorDe(feature.properties),
    weight: visible ? 1 : 0,
    opacity: visible ? 0.85 : 0,
    fillColor: colorDe(feature.properties),
    fillOpacity: visible ? 0.32 : 0
  };
}

// Construye (o devuelve de cache) la capa Leaflet de una comuna. IMPORTANTE:
// arma la capa con currentComuna apuntando a esa comuna, para que styleFor/
// normasDe clasifiquen bien cada polígono durante la construcción.
function buildLayerFor(comuna){
  if(prcLayerCache[comuna]) return prcLayerCache[comuna];
  var data = prcDataCache[comuna];
  if(!data) return null;

  var comunaPrevia = currentComuna;
  currentComuna = comuna; // contexto correcto mientras se construye
  var layer = L.geoJSON(data, {
    renderer: L.canvas({ padding: 0.5 }),
    style: styleFor,
    onEachFeature: function(feature, lyr){
      lyr.on('click', function(e){
        L.DomEvent.stopPropagation(e);
        selectZona(feature);
      });
      var n = normasDe(feature.properties);
      lyr.bindTooltip(
        feature.properties.zona + (n ? ' · ' + n.nombre : ''),
        { sticky:true, direction:'top', className:'prc-tip' }
      );
    }
  });
  currentComuna = comunaPrevia;

  prcLayerCache[comuna] = layer;
  return layer;
}

// Cambia el "contexto" del módulo a otra comuna: oculta la capa anterior del
// mapa si estaba puesta, actualiza los alias prcData/prcLayer y limpia
// selección/filtros. NO toca prcVisible ni agrega nada al mapa por sí sola.
function setActiveComuna(comuna){
  if(currentComuna === comuna) return;
  if(prcLayer && prcVisible && map.hasLayer(prcLayer)) map.removeLayer(prcLayer);
  clearHighlight();
  currentComuna = comuna;
  prcData = prcDataCache[comuna] || null;
  prcLayer = prcLayerCache[comuna] || null;
  prcFamiliaFiltro = null;
  prcSelectedFeature = null;
}

// Agrega al mapa la capa de la comuna ACTUALMENTE activa (construyéndola si falta).
function showActiveLayerOnMap(){
  if(!prcLayer) prcLayer = buildLayerFor(currentComuna);
  if(!prcLayer) return;
  if(!map.hasLayer(prcLayer)){
    prcLayer.addTo(map);
    if(prcLayer.bringToBack) prcLayer.bringToBack();
  }
  prcVisible = true;
  setBtnState();
}

// Punto central para cambiar de comuna (selector manual, chips, buscador,
// auto-switch al seleccionar un terreno). Carga los datos si hace falta,
// cambia el contexto activo y opcionalmente muestra la capa / repinta el panel.
function switchComuna(comuna, opts){
  opts = opts || {};
  if(!PRC_COMUNAS[comuna]) return;
  loadPRC(comuna, function(err){
    if(err) return;
    setActiveComuna(comuna);
    if(!prcLayer) prcLayer = buildLayerFor(comuna);
    if(opts.show) showActiveLayerOnMap();
    if(opts.render !== false){
      prcView = opts.view || 'legend';
      renderComunaChips();
      renderPanel();
      if(opts.open) openPanel();
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
  // Prender: si ya hay una comuna "activa" (por ejemplo, porque el usuario
  // venía mirando un terreno de esa comuna), se abre directo ahí. Si no,
  // parte con la primera comuna disponible.
  var objetivo = (currentComuna && PRC_COMUNAS[currentComuna]) ? currentComuna : Object.keys(PRC_COMUNAS)[0];
  switchComuna(objetivo, { show:true, view:'legend', open:true });
}

function clearHighlight(){
  if(prcHighlight){ map.removeLayer(prcHighlight); prcHighlight = null; }
}

function highlightFeature(feature){
  clearHighlight();
  prcHighlight = L.geoJSON(feature, {
    style: {
      color: '#1A1814', weight: 2.5, opacity: 1,
      fillColor: colorDe(feature.properties), fillOpacity: 0.5
    }
  }).addTo(map);
}

function selectZona(feature){
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
  renderComunaChips();

  if(!prcData){
    body.innerHTML = '<div class="no-data">Sin datos cargados.</div>';
    return;
  }

  if(prcView === 'legend'){
    headText.textContent = 'Plan Regulador · ' + (currentComuna || '');
    headDot.style.background = 'var(--pl-deep)';
    body.innerHTML = renderLegend();
    wireLegend();
  } else if(prcView === 'ranking'){
    headText.textContent = 'Potencial por zona · ' + (currentComuna || '');
    headDot.style.background = 'var(--pl-deep)';
    body.innerHTML = renderRanking();
    wireRanking();
  } else {
    if(!prcSelectedFeature){
      prcView = 'legend';
      return renderPanel();
    }
    headText.textContent = 'Zona seleccionada';
    headDot.style.background = colorDe(prcSelectedFeature.properties);
    body.innerHTML = renderZona(prcSelectedFeature);
    wireZona();
  }
  body.scrollTop = 0;
}

/* --- Vista: leyenda + filtros --- */
function renderLegend(){
  var counts = {};
  var zonasUnicas = {};
  prcData.features.forEach(function(f){
    var fam = familiaDe(f.properties);
    counts[fam] = (counts[fam] || 0) + 1;
    zonasUnicas[f.properties.zona] = true;
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

  var meta = PRC_META[currentComuna] || {};
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
      Object.keys(zonasUnicas).length + ' zonas normadas<br>' +
      'Geometría: ' + esc(meta.fuenteGeom || '—') + '<br>' +
      'Normas: ' + esc(meta.fuenteNormas || '—') +
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

/* --- Vista: ranking de zonas por potencial ---
   Agrupa directo por código de zona (funciona igual para comunas con tabla
   de normas aparte o con normas embebidas: en ambos casos guardamos una
   feature representativa de cada zona, que es lo que necesita normasDe(). */
function renderRanking(){
  var presentes = {};
  prcData.features.forEach(function(f){
    var zona = f.properties.zona;
    if(!presentes[zona]) presentes[zona] = { zona:zona, n:0, props:f.properties };
    presentes[zona].n++;
  });

  var filas = Object.keys(presentes).map(function(zona){
    var rep = presentes[zona];
    var n = normasDe(rep.props);
    var m = n && n.tablas.length ? maximosDe(rep.props) : null;
    return {
      zona: zona,
      nombre: n ? n.nombre : 'Sin normas cargadas',
      familia: n ? n.familia : 'otro',
      n: rep.n,
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
    return '<tr data-zona="' + esc(r.zona) + '">' +
      '<td>' +
        '<span class="prc-rank-dot" style="background:' + PRC_FAMILIAS[r.familia].color + '"></span>' +
        '<span class="prc-rank-code">' + esc(r.zona) + '</span>' +
        '<div style="font-size:9.5px;color:var(--text-faint);margin-top:2px;padding-left:14px">' + r.n + ' polígono' + (r.n !== 1 ? 's' : '') + '</div>' +
      '</td>' +
      '<td class="num"><strong style="font-family:var(--font-serif);font-size:14px;color:var(--pl-deep)">' + fmtCoef(r.cc) + '</strong></td>' +
      '<td class="num">' + (r.pisos || '—') + '</td>' +
      '<td class="num">' + (r.dens ? r.dens.toLocaleString('es-CL') : '—') + '</td>' +
    '</tr>';
  }).join('');

  return '<div style="font-size:12px;color:var(--text-muted);line-height:1.55;margin-bottom:12px">' +
      'Máximos alcanzables por zona, considerando la tabla de densificación / incentivo ' +
      '(no la tabla base). Ordenado por constructibilidad.' +
    '</div>' +
    '<table class="prc-rank-table">' +
      '<thead><tr><th>Zona</th><th class="num">CC máx</th><th class="num">Pisos</th><th class="num">hab/ha</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>' +
    '<div class="prc-foot">' +
      'Las normas superiores a la tabla base solo aplican si el proyecto cumple las condiciones ' +
      'que exige la Ordenanza (área libre, antejardines, tamaño predial, etc.).<br>' +
      'Click en una fila para aislar esa zona en el mapa.' +
    '</div>';
}

function wireRanking(){
  document.querySelectorAll('.prc-rank-table tbody tr').forEach(function(tr){
    tr.addEventListener('click', function(){
      var zona = tr.getAttribute('data-zona');
      if(prcLayer){
        prcLayer.setStyle(function(f){
          var match = f.properties.zona === zona;
          return {
            color: colorDe(f.properties),
            weight: match ? 1.5 : 0,
            opacity: match ? 1 : 0,
            fillColor: colorDe(f.properties),
            fillOpacity: match ? 0.5 : 0
          };
        });
      }
      var bounds = null;
      prcLayer.eachLayer(function(l){
        if(l.feature.properties.zona === zona){
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
  var n = normasDe(p);
  var fam = PRC_FAMILIAS[familiaDe(p)];
  var m = n ? maximosDe(p) : null;

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
  var etiquetaNorma = (currentComuna === 'La Florida' || currentComuna === 'Ñuñoa') ? p.zona : sp.edif;
  html += '<div class="prc-section-lbl">Normas urbanísticas · ' + esc(etiquetaNorma) + '</div>';
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

  // Incentivos generales y estacionamientos: son artículos específicos de la
  // Ordenanza de Las Condes (Cap. IV y Art. 15) — solo se muestran ahí, para
  // no citar un artículo que no corresponde a la ordenanza de otra comuna.
  if(currentComuna === 'Las Condes'){
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

    html += '<div class="prc-tabla"><div class="prc-tabla-head">' +
        '<span class="prc-tabla-tag base">P</span>' +
        '<span class="prc-tabla-label">Estacionamientos mínimos · vivienda (Art. 15)</span>' +
        '<span class="prc-tabla-arrow">▶</span>' +
      '</div><div class="prc-tabla-body">' +
        PRC_ESTACIONAMIENTOS.map(function(x){ return fila(x[0], x[1]); }).join('') +
      '</div></div>';
  }

  // Incentivos condicionales de Providencia (Art. 4.2.28) — solo aplican en
  // un subconjunto de zonas (E5(C+A), E3, EA3, EA5, EA5/pa, EA7/pa).
  if(currentComuna === 'Providencia'){
    var zonasConIncentivo = ['E5(C+A)','E3','EA3','EA5','EA5 pa','EA7 pa'];
    if(zonasConIncentivo.indexOf(sp.edif) !== -1){
      html += '<div class="prc-section-lbl">Incentivos condicionales (Art. 4.2.28)</div>';
      html += '<div class="prc-tabla"><div class="prc-tabla-head">' +
          '<span class="prc-tabla-tag base">+</span>' +
          '<span class="prc-tabla-label">Incrementos de norma aplicables en esta zona</span>' +
          '<span class="prc-tabla-arrow">▶</span>' +
        '</div><div class="prc-tabla-body">' +
          PRC_INCENTIVOS_PROVIDENCIA.map(function(x){
            return '<div style="padding:7px 0;border-bottom:1px solid var(--border)">' +
              '<div style="font-family:var(--font-mono);font-size:10px;color:var(--accent);margin-bottom:3px">' + esc(x[0]) + '</div>' +
              '<div style="font-size:11.5px;line-height:1.5;color:var(--text-muted)">' + esc(x[1]) + '</div>' +
            '</div>';
          }).join('') +
        '</div></div>' +
        '<div class="prc-nota" style="margin-top:0">Algunos de estos incentivos, según la zona, solo aplican dentro del polígono de la Modificación N°7 Barrio El Aguilucho. Verificar el plano de detalle correspondiente antes de asumirlos.</div>';
    }
  }

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
   9. INTEGRACIÓN CON EL BUSCADOR EXISTENTE
   ---------------------------------------------------------------------------
   Reusa el mismo input de búsqueda (#float-search) que ya filtra terrenos:
   si el PRC está activo y lo que se escribe empieza a coincidir con el
   nombre de una comuna cargada, cambia la capa a esa comuna. No agrega
   ningún selector nuevo a la página.
   =========================================================================== */

function normalizarTxt(s){
  return (s || '').toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita tildes/ñ→n
    .trim();
}

function intentarCambiarComunaPorBusqueda(){
  if(!prcVisible) return; // solo relevante si el usuario ya está mirando el PRC
  var input = document.getElementById('float-search');
  if(!input) return;
  var q = normalizarTxt(input.value);
  if(q.length < 3) return;

  var match = Object.keys(PRC_COMUNAS).find(function(k){
    var kn = normalizarTxt(k);
    return kn === q || kn.indexOf(q) === 0;
  });
  if(match && match !== currentComuna){
    switchComuna(match, { show:true });
  }
}


/* ===========================================================================
   10. INTEGRACIÓN CON EL DETALLE DEL TERRENO
   =========================================================================== */

function injectTerrenoSection(t){
  var cont = document.getElementById('detail-content');
  if(!cont || !t) return;

  var comuna = (typeof g === 'function') ? g(t, 'comuna') : '';
  if(!PRC_COMUNAS[comuna]) return;          // comuna sin PRC cargado
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
  loadPRC(comuna, function(err){
    // Si el usuario ya cambió de terreno, no pisar el DOM
    if(selectedId !== terrenoId) return;
    var box = document.getElementById('prc-terr-content');
    if(!box) return;

    if(err){
      box.innerHTML = '<div class="no-data">No se pudo cargar la capa del PRC.</div>';
      return;
    }

    // El módulo "sigue" al terreno: la comuna activa pasa a ser la suya.
    // Si el panel grande ya estaba visible, además se cambia la capa en el
    // mapa; si no, solo se actualiza el contexto (sin prender nada solo).
    setActiveComuna(comuna);
    if(prcVisible) showActiveLayerOnMap();

    var f = findZonaAt(t._lat, t._lng, prcDataCache[comuna]);
    if(!f){
      box.innerHTML = '<div class="no-data">El punto no cae dentro de ninguna zona del PRC de ' + esc(comuna) + '. Revisa las coordenadas.</div>';
      return;
    }
    box.innerHTML = renderTerrenoCard(f, t);

    // Si el panel grande está abierto, refrescarlo para que muestre la comuna correcta
    var panelEl = document.getElementById('prc-panel');
    if(panelEl && panelEl.classList.contains('open')){
      if(prcView === 'zona') prcView = 'legend';
      renderPanel();
    }

    var btn = document.getElementById('prc-terr-open');
    if(btn){
      btn.addEventListener('click', function(){
        // La comuna ya está cargada (venimos de acá mismo), así que este
        // switch es síncrono; selectZona() de inmediato después ya pinta
        // la vista de "zona" y abre el panel.
        switchComuna(comuna, { show:true });
        selectZona(f);
      });
    }
  });
}

function renderTerrenoCard(f, t){
  var p = f.properties;
  var n = normasDe(p);
  var m = n ? maximosDe(p) : null;
  var fam = PRC_FAMILIAS[familiaDe(p)];

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
   11. ARRANQUE
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

  // Reusar el buscador existente: si el PRC está activo, escribir el nombre
  // de una comuna cargada cambia la capa (sin agregar ningún selector nuevo)
  if(typeof window.onSearchInput === 'function'){
    var origOnSearchInput = window.onSearchInput;
    window.onSearchInput = function(){
      origOnSearchInput.apply(this, arguments);
      try { intentarCambiarComunaPorBusqueda(); }
      catch(e){ console.error('PRC: error en búsqueda de comuna', e); }
    };
  }

  // Exponer por si se necesita desde consola
  window.PRC = {
    data: function(){ return prcData; },
    dataDe: function(comuna){ return prcDataCache[comuna]; },
    findZonaAt: findZonaAt,
    normasDe: normasDe,
    normas: PRC_NORMAS,
    comunas: PRC_COMUNAS,
    toggle: togglePRC,
    switchComuna: switchComuna
  };
}

if(document.readyState === 'complete') init();
else window.addEventListener('load', init);

})();
