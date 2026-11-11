# Plataforma de gestión contable y administrativa

Aplicación web de demostración para organizar clientes, facturas, ingresos, egresos, obligaciones y reportes. Incluye interfaz adaptable a teléfonos y computadoras, una API local y una base SQLite que se crea en el primer inicio.

## Aviso sobre los datos

**Todos los datos precargados son meramente ilustrativos y ficticios.** Los nombres, identificadores con formato de RFC, correos, teléfonos, folios, importes, fechas y movimientos de ejemplo no representan personas, empresas, registros fiscales ni operaciones reales. Los correos usan el dominio reservado `.invalid` y los teléfonos son marcadores.

La copia pública contiene código y datos de muestra generados; no contiene una base SQLite, respaldos, datos guardados por usuarios, credenciales ni archivos de configuración personal. Evita ingresar información personal o financiera real en esta demostración.

## Iniciar en tu computadora

Requiere Node.js 18 o posterior. En la carpeta del proyecto ejecuta:

```sh
npm install
npm start
```

Abre `http://localhost:4173`. En el primer inicio se crea la carpeta `data/` y una base SQLite local. La contraseña temporal para la cuenta `admin` se genera al azar y aparece una sola vez en la terminal; cámbiala después de iniciar sesión.

## Usar desde un teléfono en la misma red Wi-Fi

Mantén el servidor activo y abre en el teléfono `http://IP-DE-TU-COMPUTADORA:4173`. En macOS puedes consultar la dirección local con:

```sh
ipconfig getifaddr en0
```

El teléfono y la computadora deben estar conectados a la misma red. La aplicación es local: este repositorio de GitHub no la ejecuta ni la publica como servicio web. No configures reenvío de puertos.

## Módulos

- Resumen de actividad y próximos vencimientos.
- Clientes, facturación, ingresos y egresos.
- Obligaciones y reportes por periodo.
- Usuarios con roles de administración, contabilidad y consulta.
- Bitácora de actividad y exportación CSV.

La aplicación no se conecta al SAT ni timbra CFDI.

## Datos locales

La base activa se guarda en `data/despacho.sqlite`; el archivo y los respaldos quedan excluidos de Git mediante `.gitignore`. Descarga y almacena los respaldos en un lugar protegido. Las contraseñas se almacenan con `scrypt`; las sesiones vencen después de 30 minutos de inactividad.

## Alcance

Este proyecto es una interfaz autónoma de demostración basada en SQLite. No incluye integración con la plataforma de Estancia II, conexión al SAT ni envío de información a servicios externos.
