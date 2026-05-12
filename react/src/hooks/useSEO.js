import { useEffect } from 'react';

export function useSEO({ title, description }) {
  useEffect(() => {
    const prevTitle = document.title;
    
    if (title) {
      document.title = `${title} | RS Back Office`;
    }

    let metaDescription = document.querySelector('meta[name="description"]');
    let prevDescription = '';

    if (description) {
      if (!metaDescription) {
        metaDescription = document.createElement('meta');
        metaDescription.name = 'description';
        document.head.appendChild(metaDescription);
      } else {
        prevDescription = metaDescription.content;
      }
      metaDescription.content = description;
    }

    return () => {
      // Opcional: restaurar valores al desmontar si se desea
      // document.title = prevTitle;
      // if (metaDescription && prevDescription) {
      //   metaDescription.content = prevDescription;
      // }
    };
  }, [title, description]);
}
