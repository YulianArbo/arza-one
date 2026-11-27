# M00 Multiempresa

**Para qué sirve.** Permite que varias empresas usen ARZA ONE, cada una con sus propios datos, su plan y su marca, sin que ninguna vea lo de otra. También permite entregarle a una empresa todos sus datos y, si se va, borrarlos.

**Dónde está.**

- **Administración → Empresas de la plataforma**: solo el operador de la plataforma, en ARZA TECH.
- **Administración → Empresa y sedes**: la marca de su empresa y, para la Dirección, la exportación completa.

**Quién lo usa.**

- El operador de la plataforma da de alta empresas, cambia su plan, las suspende y pide su eliminación. Ve la ficha de cada empresa, nunca su contenido.
- La Dirección de cada empresa genera y descarga la exportación completa.
- El administrador de cada empresa cambia su marca.

## Tareas frecuentes

### Dar de alta una empresa (operador)

1. Abra **Empresas de la plataforma** y elija **Nueva empresa**.
2. Escriba la razón social, el NIT con su dígito de verificación, el plan y el correo y el nombre de su primer administrador.
3. Confirme su identidad si se lo pide. La empresa nace con sus catálogos, roles y plantillas, y su administrador recibe la invitación por correo (vence en 72 horas).

### Cambiar el plan (operador)

Elija **Cambiar plan** en la fila de la empresa. Puede escribir un tope de usuarios internos distinto al del plan. Si la empresa ya pasa de un límite, no podrá agregar más personas o archivos hasta liberar.

### Suspender o reactivar una empresa (operador)

**Suspender** pide un motivo. Desde ese momento nadie de la empresa puede entrar, se cierran sus sesiones y se detienen sus tareas automáticas. Sus datos quedan intactos. **Reactivar** le devuelve el acceso.

### Cambiar la marca de su empresa (administrador)

En **Empresa y sedes → Marca de la empresa** escriba el nombre que quiere mostrar, un color principal y suba el logo (PNG o JPG de hasta 2 MB). El color debe leerse bien sobre fondo blanco; si es muy claro, la pantalla se lo dice. La marca se ve arriba en la aplicación y en el portal de sus clientes.

### Exportar todos los datos de la empresa (Dirección)

1. En **Empresa y sedes → Exportación completa** elija **Generar exportación** y confirme su identidad.
2. En unos minutos queda **Lista para descargar**. Descárguela con **Descargar**.
3. El archivo ZIP trae una hoja de Excel por cada tipo de dato (carpeta `tablas`), los archivos originales (carpeta `archivos`), un índice (`manifest.json`) para comprobar que está completo y una explicación (`LEAME.txt`). No trae contraseñas ni códigos de acceso.
4. La descarga queda disponible 7 días. Guárdela en un lugar seguro: contiene todos los datos de la empresa.

### Eliminar una empresa (operador)

1. La Dirección de la empresa debe haber generado su exportación en los últimos 30 días.
2. Suspenda la empresa y elija **Pedir eliminación**. Escriba el motivo y el NIT de la empresa para confirmar.
3. Los datos se borran **30 días después**. Hasta esa fecha puede elegir **Cancelar eliminación**. Después del borrado no se puede deshacer.

## Preguntas frecuentes

**¿Una persona puede trabajar en dos empresas?** Sí, pero con dos correos distintos: cada correo pertenece a una sola empresa.

**¿El operador puede ver los documentos o los clientes de otra empresa?** No. Solo ve su ficha: nombre, NIT, plan, número de usuarios, espacio usado y estado.
