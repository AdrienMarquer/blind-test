Parfait 👌
Voici le prompt complet à remettre à ton front-end developer, clair, complet et directement exploitable pour transformer le design system d’AdriQuiz en interface web fonctionnelle.

⸻

🎯 Prompt complet pour le front-end developer — AdriQuiz

🧩 Contexte

L’application AdriQuiz est un jeu de quiz musical et généraliste, fun et coloré.
Le système de jeu est déjà fonctionnel côté back-end (Elysia + PostgreSQL).
Le but est maintenant d’implémenter un front-end complet fidèle au design system fourni.

⸻

🎨 Identité visuelle

Logo

Utiliser le logo AdriQuiz fourni (format PNG ou SVG).
Couleurs dominantes : turquoise, rose, jaune, orange.
Style : fun, arrondi, moderne, accessible à tous.

⸻

🧭 Design System (base)

🎨 Palette de couleurs

Nom	Hex	Usage
Primaire (rose)	#EF4C83	Boutons principaux, accent
Secondaire (jaune)	#F8C027	Succès, résultats positifs
Accent (orange)	#F47A20	Hover, états actifs, alertes
Fond (turquoise clair)	#009DAA	Fond global de l’app
Contour foncé (bleu nuit)	#122B3B	Texte fort, bordures
Surface claire (blanc)	#FFFFFF	Cartes, boutons secondaires
Texte neutre (gris)	#777777	Labels, texte secondaire

💡 Tous les composants doivent maintenir un contraste suffisant pour l’accessibilité (AA minimum).

⸻

🔤 Typographie

Police principale : Poppins
	•	Titre 1 : Poppins ExtraBold
	•	Titre 2 : Poppins Bold
	•	Texte : Poppins Regular

Élément	Taille	Poids	Couleur
Titre principal	48px	ExtraBold	#122B3B
Sous-titres	32px	Bold	#122B3B
Titres de section	24px	SemiBold	#122B3B
Texte standard	16px	Regular	#122B3B
Légendes / Statuts	12–14px	Medium	#777777


⸻

🧱 Composants UI

🔘 Boutons

Type	Fond	Texte	Bordure	Rayon	Ombre
Primaire	#EF4C83	#FFFFFF	none	12px	0 4px 8px rgba(0,0,0,0.15)
Secondaire	transparent	#122B3B	2px solid #122B3B	12px	none
Succès	#F8C027	#122B3B	none	12px	none
Désactivé	#EAEAEA	#777777	none	12px	none

💬 Cartes & conteneurs
	•	Fond : blanc #FFFFFF
	•	Bord : arrondi 16px
	•	Ombre : 0 2px 6px rgba(18, 43, 59, 0.2)
	•	Titre interne : Poppins Bold 18px (rose)

✏️ Champs et inputs
	•	Fond : blanc
	•	Bordure : 2px turquoise #009DAA
	•	Focus : halo rose clair (rgba(239,76,131,0.3))
	•	Texte : #122B3B

🕹️ États & feedbacks

Type	Couleur	Exemple
Bonne réponse	#F8C027	“Bonne réponse ! +1 point 🎉”
Mauvaise réponse	#EF4C83	“Mauvaise réponse 😅”
Info / Timer	#F47A20	“Prochain morceau dans 3…”
Neutre	#009DAA	“En attente du buzz”


⸻

🧩 Iconographie
	•	Style : flat, arrondi, coloré
	•	Palette : rose, jaune, orange
	•	Sources : Lucide Icons ou Material Symbols Rounded

Icônes à prévoir :
	•	🎵 musique / blind test
	•	❓ quiz
	•	🏆 score
	•	🕹️ démarrer une partie
	•	⏰ timer
	•	🧍‍♂️ joueur / profil

⸻

🎬 Motions & transitions
	•	Durée standard : 200–300 ms
	•	Courbe d’animation : ease-in-out ou cubic-bezier(0.25, 0.1, 0.25, 1)
	•	Effets :
	•	Hover bouton → légère élévation + teinte orange
	•	Réponse correcte → animation d’étoiles jaunes/oranges
	•	Buzz → pulsation rose rapide autour du bouton
	•	Transition de page → fondu doux (opacity 0.8 → 1)

⸻

🧩 Structure des pages

1. Accueil
	•	Logo + bouton “Lancer la partie”
	•	Liste des joueurs connectés
	•	Bouton “Rejoindre une partie” (modale avec pseudo)

2. Écran de jeu
	•	Titre de la manche (mode actif)
	•	Barre de progression (timer)
	•	Bouton de buzz (gros, centré, rose)
	•	Affichage des 4 propositions après buzz
	•	Feedback immédiat (“Bonne réponse” / “Mauvaise réponse”)

3. Écran de score
	•	Tableau des scores (classement, points)
	•	Animation trophée 🏆
	•	Bouton “Rejouer”

4. Paramètres (admin / host)
	•	Choix du nombre de morceaux
	•	Mode de jeu (actuellement : “Buzz + choix”)
	•	Délai de timer
	•	Liste de morceaux actifs (titre / artiste / année / genre)

⸻

📐 Spacings & layout
	•	Base unit : 8px
	•	Marges : 8, 16, 24
	•	Radius global : 12–16px
	•	Max width (desktop) : 1200px
	•	Mobile-first, responsive.

⸻

🗣️ Ton et microcopie
	•	Langage ludique, positif et inclusif
	•	Exemples :
	•	“Prêt à jouer ? 🎵”
	•	“Tu as trouvé le bon titre ! +1 point 🎉”
	•	“Essaie encore 👀”
	•	“Prochaine manche dans 3… 2… 1…”

⸻

🧠 Objectif du front-end
	•	Implémenter ce design system dans Svelte.
	•	Créer des composants réutilisables : Button, Card, Input, Feedback, Icon, Timer, PlayerList.
	•	Appliquer les tokens de design (couleurs, typos, spacing) globalement (via SCSS variables, Tailwind config, ou CSS custom properties).
	•	Respecter l’identité visuelle du logo et du design system fourni.

⸻