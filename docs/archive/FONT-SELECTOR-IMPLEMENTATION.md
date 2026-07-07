# Selector de Fuentes - WorldNotion

## Implementación Completada ✅

Se ha añadido un selector de fuentes similar a Google Docs en la barra de herramientas flotante del editor de WorldNotion.

## Archivos Creados

### 1. **FontSelector.tsx** (`src/components/FontSelector.tsx`)
- Componente dropdown con búsqueda de fuentes
- Preview de cada fuente en tiempo real
- Búsqueda/filtrado instantáneo
- Cierre automático al hacer clic fuera

### 2. **useFonts.ts** (`src/utils/useFonts.ts`)
- Hook personalizado para detección de fuentes
- Incluye fuentes web-safe comunes
- Incluye fuentes del sistema (macOS, Windows, Linux)
- Soporte para Font Access API (Chrome/Edge) para detectar fuentes locales
- Fallback automático a fuentes comunes si no hay acceso a fuentes locales

### 3. **fontFamilyPlugin.ts** (`src/components/fontFamilyPlugin.ts`)
- Plugin de CodeMirror para renderizar fuentes
- Oculta las etiquetas HTML `<span style="font-family: ...">` cuando no hay selección
- Muestra las etiquetas como sintaxis muted cuando el cursor está dentro
- Aplica el estilo de fuente al texto sin mostrar el HTML

## Archivos Modificados

### 4. **App.tsx**
- Importado `FontSelector` y `useFonts`
- Añadido hook `useFonts()` para cargar fuentes disponibles
- Creada función `applyFontFamily()` para aplicar fuente al texto seleccionado
- Integrado `FontSelector` en la barra flotante de formato

### 5. **CodeMirrorEditor.tsx**
- Importado `fontFamilyPlugin`
- Añadido plugin a las extensiones de CodeMirror en modo "write"

### 6. **App.css**
- Estilos completos para el selector de fuentes
- Dropdown con búsqueda
- Hover states y estados seleccionados
- Tema claro/oscuro compatible

### 7. **components/index.ts**
- Exportado `FontSelector` y `FontSelectorProps`

## Cómo Funciona

1. **Selección de Texto**: El usuario selecciona texto en el editor
2. **Aparece Barra Flotante**: Se muestra automáticamente con botones de formato
3. **Selector de Fuentes**: Aparece a la izquierda de los otros botones
4. **Búsqueda**: Click en el selector abre un dropdown con búsqueda
5. **Aplicación**: Al seleccionar una fuente, se envuelve el texto en `<span style="font-family: FONT">texto</span>`
6. **Renderizado**: El plugin de CodeMirror oculta las etiquetas HTML y aplica el estilo visualmente

## Características

### Detección de Fuentes
- ✅ Fuentes web-safe (Arial, Times New Roman, etc.)
- ✅ Fuentes del sistema (SF Pro, Segoe UI, Roboto, etc.)
- ✅ Fuentes locales (mediante Font Access API en navegadores compatibles)
- ✅ Organización alfabética automática
- ✅ Fallbacks apropiados (serif, sans-serif, monospace)

### UI/UX
- ✅ Búsqueda instantánea
- ✅ Preview de fuentes en tiempo real
- ✅ Indicador visual de fuente seleccionada
- ✅ Cierre automático al hacer clic fuera
- ✅ Keyboard-friendly (Escape para cerrar)
- ✅ Tema claro/oscuro adaptativo

### Renderizado en Editor
- ✅ Oculta etiquetas HTML cuando no hay selección
- ✅ Muestra etiquetas cuando el cursor está dentro (para editar)
- ✅ Aplica estilo de fuente visualmente
- ✅ Compatible con otros formatos de Markdown

## Ejemplo de Uso

1. Abre un documento en WorldNotion
2. Escribe o selecciona texto
3. Click en el selector de fuentes en la barra flotante
4. Busca o selecciona una fuente
5. El texto se formatea automáticamente
6. En modo "write" se ve con la fuente aplicada
7. En modo "source" se ve el HTML: `<span style="font-family: Arial, sans-serif">texto</span>`

## Notas Técnicas

- **Compatibilidad**: Funciona en todos los navegadores modernos
- **Font Access API**: Solo disponible en Chrome/Edge 103+
- **Fuentes locales**: Requiere permiso del usuario en navegadores compatibles
- **Markdown**: Se guarda como HTML inline en el Markdown
- **Exportación**: Compatible con conversión HTML → Markdown
